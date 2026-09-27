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
export const FAILED_LOGIN_TTL_SECONDS = 24 * 60 * 60

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

export async function registerUser(email: string, password: string, ip?: string): Promise<User> {
	const normalizedEmail = email.trim().toLowerCase()

	const hashedPassword = await hash(password, { algorithm: 2 /* Argon2id */ })

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
			throw new AuthError('email_exists', 'Email already registered')
		}

		throw err
	}
}
