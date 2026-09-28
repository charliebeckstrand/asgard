import { createRoute, z } from '@hono/zod-openapi'
import { createRouter, errorResponse, HTTPException, jsonResponse } from 'grid'
import { ActivitySchema, PasskeySchema, type Session, TimestampSchema, UserSchema } from 'skuld'
import {
	deleteUserSessions,
	getActivity,
	getConfig,
	getFactors,
	getIdentities,
	getPasskeys,
	sendAccountDeletedEmail,
} from '../auth/index.js'
import { logger } from '../lib/log.js'
import {
	authorizeAccountDeletion,
	clearSessionCookie,
	requireSession,
	type SessionEnv,
} from '../middleware/session.js'
import { requestMimir, unavailable } from './mimir.js'
import { IdentitySchema } from './oauth.js'

// The account is the user's: they can take a copy of everything kept about
// them, and delete it all. Apps' data lives in Mimir, so both reach it too.

const AccountExportSchema = z
	.object({
		exported_at: TimestampSchema,
		user: UserSchema,
		passkeys: z.array(PasskeySchema),
		connected_accounts: z.array(IdentitySchema),
		authenticator_app: z.boolean().openapi({ description: 'Whether an authenticator app is on' }),
		activity: z.array(ActivitySchema),
		app_data: z
			.record(z.string(), z.unknown())
			.openapi({ description: "Each app's data, as Mimir keeps it" }),
	})
	.openapi('AccountExport')

const exportAccountRoute = createRoute({
	method: 'get',
	path: '/export',
	tags: ['Account'],
	summary: 'Export your account',
	description:
		'Everything kept about the signed-in user, as one JSON file: the account, how they sign in, recent activity, and the data of each app. Secrets and password hashes stay out.',
	responses: {
		200: jsonResponse(AccountExportSchema, 'Your account'),
		401: errorResponse('Not authenticated'),
		503: errorResponse('App data is unavailable'),
	},
})

const deleteAccountRoute = createRoute({
	method: 'delete',
	path: '/',
	tags: ['Account'],
	summary: 'Delete your account',
	description:
		"Deletes the signed-in user's account and all of its data, ends every session, and emails the owner. Needs the second step, when the user has a second factor, and a sign-in from the last ten minutes. An admin can't delete their account until the admin role is removed.",
	responses: {
		204: { description: 'Account deleted' },
		401: errorResponse('Not authenticated'),
		403: errorResponse('Second step or a new sign-in needed, or an admin account'),
		503: errorResponse('App data is unavailable, so nothing was deleted'),
	},
})

/**
 * Sends `method` to Mimir's `/api/account` for `user`. Any answer but a success
 * is a 503, so a refused deletion never passes for a done one.
 */
async function accountData(user: Session['user'], method: 'GET' | 'DELETE'): Promise<Response> {
	const res = await requestMimir(user, '/api/account', { method })

	if (!res.ok) {
		logger().error({ status: res.status, method }, 'mimir refused account data')

		throw unavailable()
	}

	return res
}

const adminAccount = () =>
	new HTTPException(403, { message: 'Remove the admin role before deleting the account' })

export const accountRoutes = createRouter<SessionEnv>()
	.openapi(exportAccountRoute, async (c) => {
		const { user } = requireSession(c)

		const [passkeys, identities, factors, activity, appData] = await Promise.all([
			getPasskeys(user.id),
			getIdentities(user.id),
			getFactors(user.id),
			getActivity(user.id),
			accountData(user, 'GET').then((res) => res.json() as Promise<object>),
		])

		c.header('Cache-Control', 'private, no-store')

		return c.json(
			{
				exported_at: new Date().toISOString(),
				user,
				passkeys,
				connected_accounts: identities,
				authenticator_app: factors.totp,
				activity,
				app_data: appData,
			},
			200,
		)
	})
	.openapi(deleteAccountRoute, async (c) => {
		const current = await authorizeAccountDeletion(c)

		const { user } = current

		if (user.roles.includes('admin')) throw adminAccount()

		// Other sessions end first, so none of them can write app data after
		// Mimir deletes it. When Mimir fails, the account stays, and the user can
		// try again from this session.
		await deleteUserSessions(user.id, current.id)

		await accountData(user, 'DELETE')

		const deleted = await getConfig().userRepository.deleteUser(user.id)

		if (!deleted) throw adminAccount()

		clearSessionCookie(c)

		logger().info({ userId: user.id }, 'account deleted')

		// Sent in the background, so a mail outage never keeps the account.
		sendAccountDeletedEmail(deleted).catch((err: unknown) => {
			logger().error({ err }, 'failed to send an account deleted email')
		})

		return c.body(null, 204)
	})
