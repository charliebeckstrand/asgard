import type { Logger } from 'saga/log'
import { environment } from './env.js'
import { logger } from './log.js'

/**
 * Asks Cloudflare whether a Turnstile token from the sign-up page is real and
 * unused. When Cloudflare can't answer, the token fails, so an outage stops
 * sign-ups instead of letting scripts through.
 */
export function createTurnstileCheck(
	secret: string,
	log: Logger,
): (token: string, ip?: string) => Promise<boolean> {
	return async (token, ip) => {
		try {
			const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ secret, response: token, remoteip: ip }),
				signal: AbortSignal.timeout(5_000),
			})

			if (!res.ok) throw new Error(`Turnstile answered ${res.status}`)

			const { success } = (await res.json()) as { success: boolean }

			return success
		} catch (err) {
			log.error({ err }, 'Turnstile check failed')

			return false
		}
	}
}

interface Turnstile {
	/** The key the sign-up page shows the widget with. */
	siteKey: string
	verify: (token: string, ip?: string) => Promise<boolean>
}

let configured: Turnstile | null | undefined

/**
 * Cloudflare Turnstile on sign-up, or null without both of its keys, which lets
 * every sign-up through.
 */
export function turnstile(): Turnstile | null {
	if (configured === undefined) {
		const { TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY } = environment()

		configured =
			TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY
				? {
						siteKey: TURNSTILE_SITE_KEY,
						verify: createTurnstileCheck(TURNSTILE_SECRET_KEY, logger()),
					}
				: null
	}

	return configured
}
