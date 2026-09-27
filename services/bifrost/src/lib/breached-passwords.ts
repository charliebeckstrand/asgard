import { createHash } from 'node:crypto'
import type { Logger } from 'saga/log'

/**
 * Checks a password against Have I Been Pwned's list of breached passwords.
 * Only the first five characters of its SHA-1 leave the server, and the answer
 * is padded, so neither says which password was checked. When the service
 * can't answer, the password passes, so an outage never blocks a sign-up.
 */
export function createBreachCheck(log: Logger): (password: string) => Promise<boolean> {
	return async (password) => {
		const hash = createHash('sha1').update(password).digest('hex').toUpperCase()

		try {
			const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
				headers: { 'Add-Padding': 'true', 'User-Agent': 'bifrost' },
				signal: AbortSignal.timeout(3_000),
			})

			if (!res.ok) throw new Error(`Pwned Passwords answered ${res.status}`)

			// Each line is `SUFFIX:COUNT`. Padding lines have a count of 0.
			return (await res.text()).split('\n').some((line) => {
				const [suffix, count] = line.trim().split(':')

				return suffix === hash.slice(5) && Number(count) > 0
			})
		} catch (err) {
			log.warn({ err }, 'breached password check skipped')

			return false
		}
	}
}
