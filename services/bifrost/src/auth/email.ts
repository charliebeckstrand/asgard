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
 * A link that sets a new password for the active user with `email`, or null when
 * there is none or they were sent one less than a minute ago.
 */
async function createResetLink(email: string, origin: string): Promise<string | null> {
	const creds = await getConfig().userRepository.getCredentialsByEmail(email)

	if (!creds?.is_active) return null

	return createLink(
		creds.id,
		'reset_password',
		origin,
		'/reset-password',
		RESET_PASSWORD_TTL_SECONDS,
	)
}

/**
 * Emails a link that sets a new password, when an active user has the email.
 * Says nothing either way, so no one can learn who has an account.
 */
export async function requestPasswordReset(email: string, origin: string): Promise<void> {
	const normalizedEmail = email.trim().toLowerCase()

	const link = await createResetLink(normalizedEmail, origin)

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
 * Tells the owner of `email` that someone tried to sign up with it, in place of
 * telling the one who tried. Carries a reset link in case the owner forgot
 * their password, and like a reset, sends nothing to an inactive account or
 * within a minute of the last link.
 */
export async function sendAccountExistsEmail(email: string, origin: string): Promise<void> {
	const normalizedEmail = email.trim().toLowerCase()

	const link = await createResetLink(normalizedEmail, origin)

	if (!link) return

	await getConfig().sendEmail({
		to: normalizedEmail,
		subject: 'You already have an account',
		text: [
			`Someone tried to sign up with this email, but it already has an account. Sign in at ${origin}/login.`,
			'If you forgot your password, open this link to choose a new one:',
			link,
			'The link works for one hour. If it was not you, ignore this email and nothing changes.',
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

/**
 * Tells the user that `change` happened to how they sign in, such as "A passkey
 * was added to your account", so a change they did not make never goes unseen.
 * With `origin`, it links to the page that resets the password.
 */
export async function sendSecurityNotice(
	userId: string,
	change: string,
	origin?: string,
): Promise<void> {
	const user = await getConfig().userRepository.getUserById(userId)

	if (!user) return

	const reset = origin ? ` at ${origin}/forgot-password` : ''

	await getConfig().sendEmail({
		to: user.email,
		subject: change,
		text: [
			`${change}.`,
			`If it was you, there is nothing to do. If it was not, reset your password${reset} and remove anything you do not recognize from your account.`,
		].join('\n\n'),
	})
}

export function deleteExpiredEmailTokens(): Promise<number> {
	return getConfig().emailTokenRepository.deleteExpiredTokens()
}
