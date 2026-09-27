import type { Logger } from 'saga/log'

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
