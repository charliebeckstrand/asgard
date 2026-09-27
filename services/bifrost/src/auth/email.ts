import { randomBytes } from 'node:crypto'
import { hash } from '@node-rs/argon2'
import { getConfig } from './config.js'
import { AuthError } from './errors.js'
import { hashToken } from './sessions.js'
import type { EmailPurpose } from './types.js'

export const VERIFY_EMAIL_TTL_SECONDS = 24 * 60 * 60

export const RESET_PASSWORD_TTL_SECONDS = 60 * 60

/** The least time between two emails of one purpose to one user. */
export const EMAIL_INTERVAL_SECONDS = 60

/**
 * Stores a new link of `purpose` for the user and returns its URL on `origin`,
 * the app it opens. Like a session, the link holds 32 random bytes and the
 * database only their SHA-256. Returns null when the user was sent one less
 * than a minute ago.
 */
async function createLink(
	userId: string,
	purpose: EmailPurpose,
	origin: string,
	path: string,
	ttlSeconds: number,
): Promise<string | null> {
	const token = randomBytes(32).toString('base64url')

	const created = await getConfig().emailTokenRepository.createToken(
		hashToken(token),
		userId,
		purpose,
		new Date(Date.now() + ttlSeconds * 1000),
		EMAIL_INTERVAL_SECONDS,
	)

	return created ? `${origin}${path}?token=${token}` : null
}

/** Emails the user a link that verifies their address. */
export async function sendVerificationEmail(
	user: { id: string; email: string },
	origin: string,
): Promise<void> {
	const link = await createLink(
		user.id,
		'verify_email',
		origin,
		'/verify-email',
		VERIFY_EMAIL_TTL_SECONDS,
	)

	if (!link) {
		throw new AuthError('email_recently_sent', 'We just sent you an email. Try again in a minute.')
	}

	await getConfig().sendEmail({
		to: user.email,
		subject: 'Verify your email',
		text: [
			'Open this link to verify your email:',
			link,
			'The link works for 24 hours. If you did not create an account, you can ignore this email.',
		].join('\n\n'),
	})
}

/** Marks the email of the link's user as verified. */
export async function verifyEmail(token: string): Promise<void> {
	if (!(await getConfig().emailTokenRepository.verifyEmail(hashToken(token)))) {
		throw new AuthError('link_expired', 'This link has expired or was already used')
	}
}

/**
 * Emails a link that sets a new password, when an active user has the email.
 * Says nothing either way, so no one can learn who has an account.
 */
export async function requestPasswordReset(email: string, origin: string): Promise<void> {
	const normalizedEmail = email.trim().toLowerCase()

	const creds = await getConfig().userRepository.getCredentialsByEmail(normalizedEmail)

	if (!creds?.is_active) return

	const link = await createLink(
		creds.id,
		'reset_password',
		origin,
		'/reset-password',
		RESET_PASSWORD_TTL_SECONDS,
	)

	if (!link) return

	await getConfig().sendEmail({
		to: normalizedEmail,
		subject: 'Reset your password',
		text: [
			'Someone asked to reset the password of your account. Open this link to choose a new one:',
			link,
			'The link works for one hour. If it was not you, ignore this email and your password stays the same.',
		].join('\n\n'),
	})
}

/**
 * Sets a new password with a reset link, and signs the user out everywhere. The
 * link reached their inbox, so their email counts as verified.
 */
export async function resetPassword(token: string, password: string): Promise<void> {
	const hashedPassword = await hash(password, { algorithm: 2 /* Argon2id */ })

	if (!(await getConfig().emailTokenRepository.resetPassword(hashToken(token), hashedPassword))) {
		throw new AuthError('link_expired', 'This link has expired or was already used')
	}
}

export function deleteExpiredEmailTokens(): Promise<number> {
	return getConfig().emailTokenRepository.deleteExpiredTokens()
}
