import { randomUUID } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import type { User } from 'skuld'
import { getConfig } from './config.js'
import { AuthError } from './errors.js'

export { AuthError } from './errors.js'

// Pre-compute a dummy hash for timing-safe login.
// Ensures argon2 always runs even when the user is not found,
// preventing timing-based email enumeration.
const dummyHashPromise = hash('dummy-timing-pad', { algorithm: 2 /* Argon2id */ })

/** Checks the credentials and returns the user's id. */
export async function authenticateUser(
	email: string,
	password: string,
	ip?: string,
): Promise<string> {
	const normalizedEmail = email.trim().toLowerCase()

	const { userRepository } = getConfig()

	const creds = await userRepository.getCredentialsByEmail(normalizedEmail)

	const dummyHash = await dummyHashPromise

	const hashToVerify = creds?.hashed_password ?? dummyHash

	const passwordOk = await verify(hashToVerify, password)

	if (!creds || !passwordOk) {
		if (ip)
			getConfig().onSecurityEvent?.({
				type: 'login_failed',
				ip,
				details: { email: normalizedEmail },
			})

		throw new AuthError('invalid_credentials', 'Incorrect email or password')
	}

	if (!creds.is_active) {
		throw new AuthError('account_inactive', 'Account is inactive')
	}

	if (creds.role === 'admin') {
		throw new AuthError('passkey_required', 'Admins sign in with a passkey')
	}

	return creds.id
}

export async function registerUser(email: string, password: string, ip?: string): Promise<User> {
	const normalizedEmail = email.trim().toLowerCase()

	const hashedPassword = await hash(password, { algorithm: 2 /* Argon2id */ })

	const { userRepository } = getConfig()

	try {
		const user = await userRepository.insertUser(randomUUID(), normalizedEmail, hashedPassword)

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
