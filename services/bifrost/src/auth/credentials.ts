import { hash, verify } from '@node-rs/argon2'
import type { User } from 'skuld'
import { getConfig } from './config.js'
import { AuthError } from './errors.js'

export { AuthError } from './errors.js'

// Pre-compute a dummy hash for timing-safe login.
// Ensures argon2 always runs even when the user is not found,
// preventing timing-based email enumeration.
const dummyHashPromise = hash('dummy-timing-pad', { algorithm: 2 /* Argon2id */ })

/** Wrong passwords an email gets before its tries are spaced out. */
export const MAX_FAILED_LOGINS = 5

/** How long a try waits after the last one, past `MAX_FAILED_LOGINS`. */
export const FAILED_LOGIN_WAIT_SECONDS = 60

/** How long an email's wrong passwords are remembered. */
const FAILED_LOGIN_TTL_SECONDS = 24 * 60 * 60

/**
 * Checks the credentials and returns the user's id. Each email gets
 * `MAX_FAILED_LOGINS` wrong passwords, then one try a minute, from any address.
 * Unknown emails count the same, so the limit reveals no accounts.
 */
export async function authenticateUser(
	email: string,
	password: string,
	ip?: string,
): Promise<string> {
	const normalizedEmail = email.trim().toLowerCase()

	const { userRepository } = getConfig()

	if (
		!(await userRepository.countFailedLogin(
			normalizedEmail,
			MAX_FAILED_LOGINS,
			FAILED_LOGIN_WAIT_SECONDS,
		))
	) {
		throw new AuthError('too_many_logins', 'Too many wrong passwords. Try again in a minute')
	}

	const creds = await userRepository.getCredentialsByEmail(normalizedEmail)

	const dummyHash = await dummyHashPromise

	const hashToVerify = creds?.hashed_password ?? dummyHash

	const passwordOk = await verify(hashToVerify, password)

	// An account made with GitHub or Google has no password, and the dummy hash
	// must never let one in.
	if (!creds?.hashed_password || !passwordOk) {
		if (ip)
			getConfig().onSecurityEvent?.({
				type: 'login_failed',
				ip,
				details: { email: normalizedEmail },
			})

		throw new AuthError('invalid_credentials', 'Incorrect email or password')
	}

	await userRepository.clearFailedLogins(normalizedEmail)

	if (!creds.is_active) {
		throw new AuthError('account_inactive', 'Account is inactive')
	}

	return creds.id
}

export function deleteStaleFailedLogins(): Promise<number> {
	return getConfig().userRepository.deleteStaleFailedLogins(FAILED_LOGIN_TTL_SECONDS)
}

/**
 * Hashes a password the user chose, after refusing one known from a data breach,
 * since anyone trying leaked passwords against accounts would guess it first.
 */
export async function hashNewPassword(password: string): Promise<string> {
	if (await getConfig().isBreachedPassword?.(password)) {
		throw new AuthError(
			'password_breached',
			'This password has appeared in a data breach. Choose a different one.',
		)
	}

	return hash(password, { algorithm: 2 /* Argon2id */ })
}

/** The key that the sign-up page shows Turnstile with, or null when sign-up has no check. */
export function turnstileSiteKey(): string | null {
	return getConfig().turnstile?.siteKey ?? null
}

/** Refuses a sign-up without a valid Turnstile token, when Turnstile is on. */
export async function checkTurnstile(token: string | undefined, ip?: string): Promise<void> {
	const { turnstile } = getConfig()

	if (turnstile && !(token && (await turnstile.verify(token, ip)))) {
		throw new AuthError('turnstile_failed', 'We could not confirm that you are human. Try again.')
	}
}

/**
 * Creates an account for `email`, or returns null when it already has one. The
 * password is hashed either way, so the two take the same time.
 */
export async function registerUser(
	email: string,
	password: string,
	ip?: string,
): Promise<User | null> {
	const normalizedEmail = email.trim().toLowerCase()

	const hashedPassword = await hashNewPassword(password)

	const { userRepository } = getConfig()

	try {
		const user = await userRepository.insertUser(normalizedEmail, hashedPassword)

		if (ip)
			getConfig().onSecurityEvent?.({
				type: 'registration',
				ip,
				details: { email: normalizedEmail },
			})

		return user
	} catch (err: unknown) {
		if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
			return null
		}

		throw err
	}
}
