import { normalizeEmail, type User } from 'skuld'
import { getConfig } from './config.js'
import { hashNewPassword } from './credentials.js'
import { AuthError } from './errors.js'
import { expiresIn, hashToken, randomToken } from './sessions.js'
import type { Email, EmailLimits, EmailPurpose } from './types.js'

export const VERIFY_EMAIL_TTL_SECONDS = 24 * 60 * 60

export const RESET_PASSWORD_TTL_SECONDS = 60 * 60

/** The least time between two emails of one purpose to one user. */
export const EMAIL_INTERVAL_SECONDS = 60

/**
 * The most emails in a day. The total is the quota of Resend's free plan.
 * Anyone can sign up with made-up addresses, so unverified ones get only half,
 * which keeps the rest for accounts that proved their email. No one address
 * gets more than ten, so no one can spend the rest on a single account.
 */
export const EMAIL_LIMITS: EmailLimits = { total: 100, unverified: 50, recipient: 10 }

function tooManyEmails(): AuthError {
	return new AuthError(
		'too_many_emails',
		'We have sent all the email we can today. Try again tomorrow',
	)
}

/** Sends `email` when the last day's limits leave room for it. */
async function send(email: Email, verified: boolean): Promise<void> {
	const config = getConfig()

	if (!(await config.emailTokenRepository.countSentEmail(email.to, verified, EMAIL_LIMITS))) {
		throw tooManyEmails()
	}

	await config.sendEmail(email)
}

interface LinkEmail {
	purpose: EmailPurpose
	path: string
	ttlSeconds: number
	subject: string
	/** The email's paragraphs, with the link among them. */
	text: (link: string) => string[]
}

/**
 * Stores a new link for the user and emails it to `to`, with the link on
 * `origin`, the app it opens. Like a session, the link holds 32 random bytes
 * and the database only their SHA-256. Returns false, and sends nothing, when
 * the user was sent one less than a minute ago. When the day's limits leave no
 * room, nothing is stored, so the link already in the inbox keeps working.
 */
async function sendLink(
	user: { id: string; to: string; verified: boolean },
	origin: string,
	email: LinkEmail,
): Promise<boolean> {
	const config = getConfig()

	const token = randomToken()

	const created = await config.emailTokenRepository.createToken(
		hashToken(token),
		user.id,
		email.purpose,
		expiresIn(email.ttlSeconds),
		{
			interval: EMAIL_INTERVAL_SECONDS,
			email: { to: user.to, verified: user.verified },
			limits: EMAIL_LIMITS,
		},
	)

	if (created === 'recently_sent') return false

	if (created === 'over_budget') throw tooManyEmails()

	const link = `${origin}${email.path}?token=${token}`

	await config.sendEmail({
		to: user.to,
		subject: email.subject,
		text: email.text(link).join('\n\n'),
	})

	return true
}

/** Emails the user a link that verifies their address. */
export async function sendVerificationEmail(
	user: { id: string; email: string },
	origin: string,
): Promise<void> {
	const sent = await sendLink({ id: user.id, to: user.email, verified: false }, origin, {
		purpose: 'verify_email',
		path: '/verify-email',
		ttlSeconds: VERIFY_EMAIL_TTL_SECONDS,
		subject: 'Verify your email',
		text: (link) => [
			'Open this link to verify your email:',
			link,
			'The link works for 24 hours. If you did not create an account, you can ignore this email.',
		],
	})

	if (!sent) {
		throw new AuthError('email_recently_sent', 'We just sent you an email. Try again in a minute.')
	}
}

/** Marks the email of the link's user as verified. Returns the user's id. */
export async function verifyEmail(token: string): Promise<string> {
	const userId = await getConfig().emailTokenRepository.verifyEmail(hashToken(token))

	if (!userId) {
		throw new AuthError('link_expired', 'This link has expired or was already used')
	}

	return userId
}

/**
 * Emails a link that sets a new password to the active user with `email`, with
 * `subject` and `text`. Sends nothing when there is none, or when they were sent
 * one less than a minute ago.
 */
async function sendResetLink(
	email: string,
	origin: string,
	content: Pick<LinkEmail, 'subject' | 'text'>,
): Promise<void> {
	const creds = await getConfig().userRepository.getCredentialsByEmail(email)

	if (!creds?.is_active) return

	await sendLink({ id: creds.id, to: email, verified: creds.is_verified }, origin, {
		purpose: 'reset_password',
		path: '/reset-password',
		ttlSeconds: RESET_PASSWORD_TTL_SECONDS,
		...content,
	})
}

/**
 * Emails a link that sets a new password, when an active user has the email.
 * Says nothing either way, so no one can learn who has an account.
 */
export async function requestPasswordReset(email: string, origin: string): Promise<void> {
	await sendResetLink(normalizeEmail(email), origin, {
		subject: 'Reset your password',
		text: (link) => [
			'Someone asked to reset the password of your account. Open this link to choose a new one:',
			link,
			'The link works for one hour. If it was not you, ignore this email and your password stays the same.',
		],
	})
}

/**
 * Tells the owner of `email` that someone tried to sign up with it, in place of
 * telling the one who tried. Carries a reset link in case the owner forgot
 * their password, and like a reset, sends nothing to an inactive account or
 * within a minute of the last link.
 */
export async function sendAccountExistsEmail(email: string, origin: string): Promise<void> {
	await sendResetLink(normalizeEmail(email), origin, {
		subject: 'You already have an account',
		text: (link) => [
			`Someone tried to sign up with this email, but it already has an account. Sign in at ${origin}/login.`,
			'If you forgot your password, open this link to choose a new one:',
			link,
			'The link works for one hour. If it was not you, ignore this email and nothing changes.',
		],
	})
}

/**
 * Sets a new password with a reset link, and signs the user out everywhere. The
 * link reached their inbox, so their email counts as verified. Returns the
 * user's id.
 */
export async function resetPassword(token: string, password: string): Promise<string> {
	const hashedPassword = await hashNewPassword(password)

	const userId = await getConfig().emailTokenRepository.resetPassword(
		hashToken(token),
		hashedPassword,
	)

	if (!userId) {
		throw new AuthError('link_expired', 'This link has expired or was already used')
	}

	return userId
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

	await send(
		{
			to: user.email,
			subject: change,
			text: [
				`${change}.`,
				`If it was you, there is nothing to do. If it was not, reset your password${reset} and remove anything you do not recognize from your account.`,
			].join('\n\n'),
		},
		user.is_verified,
	)
}

/**
 * Tells a user their account was deleted, so a deletion they did not make never
 * goes unseen. Takes the user as they were, since their row is gone.
 */
export async function sendAccountDeletedEmail(user: User): Promise<void> {
	await send(
		{
			to: user.email,
			subject: 'Your account was deleted',
			text: [
				'Your account and all of its data were deleted.',
				'If it was not you, someone else could sign in to your account. You can sign up again with this email, with a new password.',
			].join('\n\n'),
		},
		user.is_verified,
	)
}

export function deleteExpiredEmailTokens(): Promise<number> {
	return getConfig().emailTokenRepository.deleteExpiredTokens()
}

export function deleteOldSentEmails(): Promise<number> {
	return getConfig().emailTokenRepository.deleteOldSentEmails()
}
