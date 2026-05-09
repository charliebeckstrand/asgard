vi.mock('../lib/db.js', () => ({
	db: { ping: vi.fn().mockResolvedValue(true) },
	closePool: vi.fn(),
}))

import { getRules } from '@/handlers/rules'

describe('getRules', () => {
	it('returns all predefined rules', () => {
		const rules = getRules()

		expect(rules).toBeInstanceOf(Array)
		expect(rules.length).toBeGreaterThanOrEqual(4)
	})

	it('includes brute force detection rule', () => {
		const rules = getRules()

		const bruteForce = rules.find((r) => r.id === 'brute_force')

		expect(bruteForce).toBeDefined()
		expect(bruteForce?.event_type).toBe('login_failed')
		expect(bruteForce?.threshold).toBe(10)
		expect(bruteForce?.window_minutes).toBe(15)
		expect(bruteForce?.ban_duration_minutes).toBe(60)
		expect(bruteForce?.enabled).toBe(true)
	})

	it('includes registration spam detection rule', () => {
		const rules = getRules()

		const regSpam = rules.find((r) => r.id === 'registration_spam')

		expect(regSpam).toBeDefined()
		expect(regSpam?.event_type).toBe('registration')
		expect(regSpam?.threshold).toBe(5)
		expect(regSpam?.ban_duration_minutes).toBe(1440)
	})

	it('includes rate limit abuse detection rule', () => {
		const rules = getRules()

		const rateAbuse = rules.find((r) => r.id === 'rate_limit_abuse')

		expect(rateAbuse).toBeDefined()
		expect(rateAbuse?.event_type).toBe('rate_limited')
		expect(rateAbuse?.threshold).toBe(20)
	})

	it('includes credential stuffing detection rule with distinct_accounts', () => {
		const rules = getRules()

		const credStuffing = rules.find((r) => r.id === 'credential_stuffing')

		expect(credStuffing).toBeDefined()
		expect(credStuffing?.event_type).toBe('login_failed')
		expect(credStuffing?.threshold).toBe(15)
		expect(credStuffing?.distinct_accounts).toBe(10)
	})

	it('returns all rules as enabled', () => {
		const rules = getRules()

		for (const rule of rules) {
			expect(rule.enabled).toBe(true)
		}
	})
})
