import { createHash, randomBytes } from 'node:crypto'
import { getConfig, type OAuthClient } from './config.js'
import { AuthError } from './errors.js'
import { hashToken } from './sessions.js'
import type { LinkedIdentity, OAuthIdentity, OAuthProvider, StoredOAuthState } from './types.js'

export const OAUTH_STATE_TTL_SECONDS = 5 * 60

export const OAUTH_PROVIDERS = ['github', 'google'] as const satisfies readonly OAuthProvider[]

/** Why a sign-in with a provider failed. The callback sends the browser back with it. */
export type OAuthFailureCode =
	| 'oauth_failed'
	| 'email_unverified'
	| 'account_exists'
	| 'identity_in_use'
	| 'provider_linked'
	| 'account_inactive'

export class OAuthFailure extends Error {
	constructor(
		public readonly code: OAuthFailureCode,
		message: string,
		/** Whether the failure ended a connect from the account page, not a sign-in. */
		public readonly linking = false,
	) {
		super(message)
		this.name = 'OAuthFailure'
	}
}

/** The result of a callback: the user to sign in, or the user who connected an account. */
export type OAuthOutcome =
	| { kind: 'sign_in'; userId: string; returnTo: string }
	| { kind: 'linked'; userId: string; returnTo: string }

const endpoints = {
	google: {
		authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
		token: 'https://oauth2.googleapis.com/token',
		scope: 'openid email',
	},
	github: {
		authorize: 'https://github.com/login/oauth/authorize',
		token: 'https://github.com/login/oauth/access_token',
		scope: 'user:email',
	},
} as const

/** The providers that have a client, in a fixed order. */
export function enabledProviders(): OAuthProvider[] {
	const { oauth } = getConfig()

	return OAUTH_PROVIDERS.filter((provider) => oauth[provider])
}

function client(provider: OAuthProvider): OAuthClient {
	const found = getConfig().oauth[provider]

	if (!found) {
		throw new AuthError('oauth_unavailable', 'This sign-in method is not set up')
	}

	return found
}

function callbackUrl(origin: string, provider: OAuthProvider): string {
	return `${origin}/auth/oauth/${provider}/callback`
}

/**
 * A path on the app to go to after the sign-in. Anything else, such as a full
 * URL or `//host`, falls back to `fallback`, so the callback never sends the
 * browser to another site.
 */
export function safeReturnTo(value: string | undefined, fallback: string): string {
	if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
		return fallback
	}

	return value
}

/**
 * Starts a sign-in with the provider, or connects its account to `linkUserId`.
 * Returns the `state` for the browser's cookie and the provider URL to go to.
 * The state and the PKCE verifier stay in the database for five minutes.
 */
export async function startOAuth(
	provider: OAuthProvider,
	options: { origin: string; returnTo: string; linkUserId?: string },
): Promise<{ state: string; url: string }> {
	const { clientId } = client(provider)

	const state = randomBytes(32).toString('base64url')

	const verifier = randomBytes(32).toString('base64url')

	await getConfig().oauthRepository.createState(
		hashToken(state),
		{
			provider,
			verifier,
			origin: options.origin,
			return_to: options.returnTo,
			user_id: options.linkUserId ?? null,
		},
		new Date(Date.now() + OAUTH_STATE_TTL_SECONDS * 1000),
	)

	const url = new URL(endpoints[provider].authorize)

	url.search = new URLSearchParams({
		client_id: clientId,
		redirect_uri: callbackUrl(options.origin, provider),
		response_type: 'code',
		scope: endpoints[provider].scope,
		state,
		code_challenge: createHash('sha256').update(verifier).digest('base64url'),
		code_challenge_method: 'S256',
	}).toString()

	return { state, url: url.toString() }
}

/**
 * Finishes the sign-in that `state` started: trades the code for a token, reads
 * the account, and finds, makes, or connects its user.
 *
 * @remarks
 * An account whose email already belongs to a user never signs in as that
 * user. The gateway does not verify emails, so someone who registered the
 * email first could otherwise keep a password on the account. The user must
 * sign in first and connect the account from the account page.
 */
export async function completeOAuth(
	provider: OAuthProvider,
	state: string,
	code: string,
	ip?: string,
): Promise<OAuthOutcome> {
	const { oauthRepository, userRepository, onSecurityEvent } = getConfig()

	const stored = await oauthRepository.useState(hashToken(state))

	if (!stored || stored.provider !== provider) {
		throw new OAuthFailure('oauth_failed', 'The sign-in expired. Please try again.')
	}

	const identity = await fetchIdentity(provider, code, stored).catch((err: unknown) => {
		if (err instanceof OAuthFailure && stored.user_id) {
			throw new OAuthFailure(err.code, err.message, true)
		}

		throw err
	})

	if (stored.user_id) {
		const result = await oauthRepository.linkIdentity(stored.user_id, identity)

		if (result === 'in_use') {
			throw new OAuthFailure('identity_in_use', 'That account is connected to another user', true)
		}

		if (result === 'provider_linked') {
			throw new OAuthFailure('provider_linked', 'Disconnect your other account first', true)
		}

		return { kind: 'linked', userId: stored.user_id, returnTo: stored.return_to }
	}

	let userId = await oauthRepository.findIdentityUser(provider, identity.subject)

	if (!userId) {
		if (!identity.email) {
			throw new OAuthFailure('email_unverified', 'That account has no verified email')
		}

		const created = await oauthRepository.createUserWithIdentity({
			...identity,
			email: identity.email.toLowerCase(),
		})

		if (created === 'email_exists') {
			throw new OAuthFailure(
				'account_exists',
				'An account with that email exists. Sign in with it, then connect this account from the account page.',
			)
		}

		userId = created.userId

		if (ip)
			onSecurityEvent?.({ type: 'registration', ip, details: { email: identity.email, provider } })
	}

	const user = await userRepository.getUserById(userId)

	if (!user?.is_active) {
		throw new OAuthFailure('account_inactive', 'Account is inactive')
	}

	return { kind: 'sign_in', userId, returnTo: stored.return_to }
}

async function fetchIdentity(
	provider: OAuthProvider,
	code: string,
	stored: StoredOAuthState,
): Promise<OAuthIdentity> {
	const { clientId, clientSecret } = client(provider)

	const tokenResponse = await fetch(endpoints[provider].token, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			code_verifier: stored.verifier,
			grant_type: 'authorization_code',
			redirect_uri: callbackUrl(stored.origin, provider),
		}),
	}).catch(() => null)

	const token = tokenResponse?.ok
		? ((await tokenResponse.json()) as { access_token?: string })
		: null

	if (!token?.access_token) {
		throw new OAuthFailure('oauth_failed', 'The provider did not accept the sign-in')
	}

	const identity =
		provider === 'google'
			? await fetchGoogleIdentity(token.access_token)
			: await fetchGithubIdentity(token.access_token)

	if (!identity) {
		throw new OAuthFailure('oauth_failed', 'The provider did not return the account')
	}

	return identity
}

async function getJson<T>(url: string, accessToken: string): Promise<T | null> {
	const res = await fetch(url, {
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${accessToken}`,
			'User-Agent': 'bifrost',
		},
	}).catch(() => null)

	return res?.ok ? ((await res.json()) as T) : null
}

async function fetchGoogleIdentity(accessToken: string): Promise<OAuthIdentity | null> {
	const info = await getJson<{ sub?: string; email?: string; email_verified?: boolean }>(
		'https://openidconnect.googleapis.com/v1/userinfo',
		accessToken,
	)

	if (!info?.sub) return null

	return {
		provider: 'google',
		subject: info.sub,
		email: info.email && info.email_verified === true ? info.email : null,
	}
}

async function fetchGithubIdentity(accessToken: string): Promise<OAuthIdentity | null> {
	const user = await getJson<{ id?: number }>('https://api.github.com/user', accessToken)

	if (typeof user?.id !== 'number') return null

	const emails = await getJson<{ email: string; primary: boolean; verified: boolean }[]>(
		'https://api.github.com/user/emails',
		accessToken,
	)

	const primary = emails?.find((entry) => entry.primary && entry.verified)

	return { provider: 'github', subject: String(user.id), email: primary?.email ?? null }
}

export function getIdentities(userId: string): Promise<LinkedIdentity[]> {
	return getConfig().oauthRepository.getIdentities(userId)
}

export async function unlinkIdentity(userId: string, provider: OAuthProvider): Promise<void> {
	const result = await getConfig().oauthRepository.unlinkIdentity(userId, provider)

	if (result === 'not_found') {
		throw new AuthError('identity_not_found', 'That account is not connected')
	}

	if (result === 'last_sign_in') {
		throw new AuthError(
			'last_sign_in',
			'Add a passkey or connect another account first, so that you can still sign in',
		)
	}
}

export function deleteExpiredOAuthStates(): Promise<number> {
	return getConfig().oauthRepository.deleteExpiredStates()
}
