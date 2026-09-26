import { timingSafeEqual } from 'node:crypto'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { errorResponse, HTTPException, jsonResponse, validationHook } from 'grid'
import { getIpAddress } from 'grid/middleware'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import {
	AuthError,
	completeOAuth,
	createLoginTicket,
	createSession,
	deleteLoginTicket,
	enabledProviders,
	getFactors,
	getIdentities,
	OAuthFailure,
	requireRecentSignIn,
	safeReturnTo,
	secondFactorMethods,
	startOAuth,
	unlinkIdentity,
} from '../auth/index.js'
// Read when the module loads, so they come from the module itself and not the
// barrel that route tests mock.
import { OAUTH_PROVIDERS, OAUTH_STATE_TTL_SECONDS } from '../auth/oauth.js'
import { environment } from '../lib/env.js'
import { logger } from '../lib/log.js'
import {
	clearLoginTicketCookie,
	getLoginTicket,
	getSessionToken,
	requireSession,
	type SessionEnv,
	setLoginTicketCookie,
	setSessionCookie,
} from '../middleware/session.js'

// GitHub and Google sign-in. The browser goes to `/start`, then to the provider,
// then back to `/callback`. Both answer with redirects, not JSON, since the
// browser navigates to them. Each Midgard app forwards `/auth/*` here, so the
// redirect URI is on the app's own origin.

// `__Host-oauth` holds the `state` of the sign-in this browser started, so a
// callback URL from someone else's sign-in can't sign this browser in.
const STATE_COOKIE_NAME = 'oauth'

const ProviderSchema = z.enum(OAUTH_PROVIDERS).openapi({ param: { name: 'provider', in: 'path' } })

const ProvidersSchema = z
	.object({
		providers: z.array(z.enum(OAUTH_PROVIDERS)).openapi({ description: 'The providers set up' }),
	})
	.openapi('OAuthProviders')

const IdentitySchema = z
	.object({
		provider: z.enum(OAUTH_PROVIDERS),
		email: z.string().nullable().openapi({ description: 'The verified email of the account' }),
		created_at: z.string(),
	})
	.openapi('Identity')

const IdentitiesSchema = z.object({ identities: z.array(IdentitySchema) }).openapi('Identities')

const providersRoute = createRoute({
	method: 'get',
	path: '/providers',
	tags: ['OAuth'],
	summary: 'List the sign-in providers',
	responses: {
		200: jsonResponse(ProvidersSchema, 'The providers set up on this server'),
	},
})

const listIdentitiesRoute = createRoute({
	method: 'get',
	path: '/identities',
	tags: ['OAuth'],
	summary: 'List your connected accounts',
	responses: {
		200: jsonResponse(IdentitiesSchema, 'Your connected accounts'),
		401: errorResponse('Not authenticated'),
	},
})

const unlinkIdentityRoute = createRoute({
	method: 'delete',
	path: '/identities/{provider}',
	tags: ['OAuth'],
	summary: 'Disconnect an account',
	description:
		'Needs a sign-in from the last ten minutes. Refuses when the user then has no password, no other connected account, and no passkey.',
	request: { params: z.object({ provider: ProviderSchema }) },
	responses: {
		204: { description: 'Account disconnected' },
		401: errorResponse('Not authenticated'),
		403: errorResponse('Sign in again'),
		404: errorResponse('Not connected'),
		409: errorResponse('Last way to sign in'),
	},
})

/**
 * The app origin that the request came through, from the forwarded host. Only
 * an origin in `CORS_ORIGIN` counts, so the redirect URI is always one of the
 * apps.
 */
function appOrigin(c: Context): string | undefined {
	const host = c.req.header('x-forwarded-host') ?? c.req.header('host')

	return environment().CORS_ORIGIN.find((origin) => new URL(origin).host === host)
}

function withError(path: string, code: string): string {
	return `${path}?error=${encodeURIComponent(code)}`
}

function setStateCookie(c: Context, state: string) {
	setCookie(c, STATE_COOKIE_NAME, state, {
		prefix: 'host',
		httpOnly: true,
		secure: true,
		sameSite: 'Lax',
		path: '/',
		maxAge: OAUTH_STATE_TTL_SECONDS,
	})
}

function sameState(cookie: string | undefined, query: string | undefined): boolean {
	if (!cookie || !query) return false

	const a = Buffer.from(cookie)

	const b = Buffer.from(query)

	return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Signs the user in, or holds the sign-in for its second step like a password
 * would. Returns the path to go to.
 */
async function finishSignIn(c: Context, userId: string, returnTo: string): Promise<string> {
	const methods = secondFactorMethods(await getFactors(userId))

	// A ticket from an earlier first step ends, so each browser holds one.
	const earlier = getLoginTicket(c)

	if (earlier) await deleteLoginTicket(earlier)

	if (methods.length > 0) {
		setLoginTicketCookie(c, await createLoginTicket(userId))

		return '/login/verify'
	}

	if (earlier) clearLoginTicketCookie(c)

	const { token } = await createSession(userId, getSessionToken(c))

	setSessionCookie(c, token)

	return returnTo
}

export const oauthRoutes = new OpenAPIHono<SessionEnv>({ defaultHook: validationHook })
	.openapi(providersRoute, (c) => c.json({ providers: enabledProviders() }, 200))
	.openapi(listIdentitiesRoute, async (c) => {
		const { user } = requireSession(c)

		c.header('Cache-Control', 'private, no-store')

		return c.json({ identities: await getIdentities(user.id) }, 200)
	})
	.openapi(unlinkIdentityRoute, async (c) => {
		const session = requireSession(c)

		requireRecentSignIn(session)

		await unlinkIdentity(session.user.id, c.req.valid('param').provider)

		return c.body(null, 204)
	})

/**
 * `GET /{provider}/start?return_to=/path`: goes to the provider. With `link=1`,
 * connects the account to the signed-in user instead, which needs a sign-in from
 * the last ten minutes. A failure goes back to `/login` or `/account` with
 * `?error=<code>`.
 */
oauthRoutes.get('/:provider/start', async (c) => {
	const provider = ProviderSchema.safeParse(c.req.param('provider'))

	const linking = c.req.query('link') === '1'

	const fallback = linking ? '/account' : '/'

	const failed = linking ? '/account' : '/login'

	if (!provider.success) return c.notFound()

	const origin = appOrigin(c)

	if (!origin) {
		return c.json({ message: 'Unknown app origin' }, 400)
	}

	try {
		let linkUserId: string | undefined

		if (linking) {
			const session = requireSession(c)

			requireRecentSignIn(session)

			linkUserId = session.user.id
		}

		const { state, url } = await startOAuth(provider.data, {
			origin,
			returnTo: safeReturnTo(c.req.query('return_to'), fallback),
			linkUserId,
		})

		setStateCookie(c, state)

		return c.redirect(url, 302)
	} catch (err) {
		if (err instanceof AuthError) return c.redirect(withError(failed, err.code), 302)

		// No session to connect the account to.
		if (err instanceof HTTPException) return c.redirect('/login', 302)

		throw err
	}
})

/** `GET /{provider}/callback`: the provider sends the browser back here. */
oauthRoutes.get('/:provider/callback', async (c) => {
	const provider = ProviderSchema.safeParse(c.req.param('provider'))

	if (!provider.success) return c.notFound()

	const state = c.req.query('state')

	const code = c.req.query('code')

	const cookie = getCookie(c, STATE_COOKIE_NAME, 'host')

	deleteCookie(c, STATE_COOKIE_NAME, { prefix: 'host', secure: true, path: '/' })

	// The user canceled at the provider, or the callback is not from this browser's sign-in.
	if (!code || !state || !sameState(cookie, state)) {
		return c.redirect(withError('/login', 'oauth_failed'), 302)
	}

	try {
		const outcome = await completeOAuth(provider.data, state, code, getIpAddress(c))

		if (outcome.kind === 'linked') return c.redirect(outcome.returnTo, 302)

		return c.redirect(await finishSignIn(c, outcome.userId, outcome.returnTo), 302)
	} catch (err) {
		if (err instanceof OAuthFailure) {
			return c.redirect(withError(err.linking ? '/account' : '/login', err.code), 302)
		}

		logger().error({ err, provider: provider.data }, 'oauth callback failed')

		return c.redirect(withError('/login', 'oauth_failed'), 302)
	}
})
