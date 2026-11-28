import type { Logger } from 'saga/log'
import { environment } from './env.js'
import { logger } from './log.js'

/** A plain-text email. */
export interface Email {
	to: string
	subject: string
	text: string
}

/**
 * Sends email through Resend's HTTP API. Without an API key, it logs each email
 * instead, with the links only outside production, so local sign-ups can be
 * verified from the log.
 */
export function createMailer(options: {
	apiKey?: string
	from: string
	production: boolean
	log: Logger
}): (email: Email) => Promise<void> {
	const { apiKey, from, production, log } = options

	if (!apiKey) {
		return async ({ to, subject, text }) => {
			log.warn(
				{ to, subject, text: production ? undefined : text },
				'email not sent: RESEND_API_KEY is unset',
			)
		}
	}

	return async ({ to, subject, text }) => {
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ from, to, subject, text }),
			signal: AbortSignal.timeout(10_000),
		})

		if (!res.ok) {
			throw new Error(`Resend answered ${res.status}: ${await res.text()}`)
		}
	}
}

let mailer: ((email: Email) => Promise<void>) | undefined

/** Sends an email, such as a link to verify the address or reset the password. */
export function sendEmail(email: Email): Promise<void> {
	if (!mailer) {
		const env = environment()

		mailer = createMailer({
			apiKey: env.RESEND_API_KEY,
			from: env.EMAIL_FROM,
			production: env.NODE_ENV === 'production',
			log: logger(),
		})
	}

	return mailer(email)
}
