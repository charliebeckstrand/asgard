const { mockDbOne, mockCreateBan, mockCreateThreat } = vi.hoisted(() => ({
	mockDbOne: vi.fn(),
	mockCreateBan: vi.fn(),
	mockCreateThreat: vi.fn(),
}))

vi.mock('../../lib/db.js', () => ({
	db: { one: mockDbOne },
	closePool: vi.fn(),
}))

vi.mock('../../handlers/bans.js', () => ({
	createBan: (...args: unknown[]) => mockCreateBan(...args),
}))

vi.mock('../../handlers/threats.js', () => ({
	createThreat: (...args: unknown[]) => mockCreateThreat(...args),
}))

vi.mock('../../lib/log.js', () => ({
	logger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { evaluateRules, getRules } from '../../handlers/rules.js'

const IP = '203.0.113.42'

beforeEach(() => {
	vi.clearAllMocks()

	mockCreateBan.mockResolvedValue({})
	mockCreateThreat.mockResolvedValue({})
})

function rule(id: string) {
	const found = getRules().find((r) => r.id === id)

	if (!found) throw new Error(`unknown rule ${id}`)

	return found
}

describe('evaluateRules', () => {
	describe('brute_force', () => {
		const r = rule('brute_force')

		it('triggers a ban + threat when event_count meets threshold', async () => {
			// 'login_failed' fans out to both brute_force and credential_stuffing.
			// Set account_count = 1 to keep credential_stuffing below its
			// distinct_accounts floor and isolate brute_force.
			mockDbOne.mockResolvedValue({ event_count: r.threshold, account_count: 1 })

			await evaluateRules(IP, 'login_failed')

			expect(mockCreateBan).toHaveBeenCalledWith(
				IP,
				r.name,
				expect.objectContaining({
					rule_id: r.id,
					created_by: 'vidar',
					duration_minutes: r.ban_duration_minutes,
				}),
			)

			expect(mockCreateThreat).toHaveBeenCalledWith(
				expect.objectContaining({
					threat_type: r.id,
					severity: r.severity,
					ip: IP,
					action_taken: expect.stringMatching(/Banned for /),
				}),
			)
		})

		it('does NOT trigger when event_count is below threshold', async () => {
			mockDbOne.mockResolvedValue({ event_count: r.threshold - 1, account_count: 1 })

			await evaluateRules(IP, 'login_failed')

			expect(mockCreateBan).not.toHaveBeenCalledWith(IP, r.name, expect.anything())
		})
	})

	describe('credential_stuffing distinct_accounts gating', () => {
		const r = rule('credential_stuffing')

		it('does NOT trigger when distinct accounts is below the floor', async () => {
			// brute_force runs against the same event, but with account_count 1
			// it stays below brute_force.threshold most of the time. Set
			// event_count just under brute_force.threshold to isolate
			// credential_stuffing's behaviour.
			mockDbOne.mockResolvedValue({
				event_count: r.threshold,
				account_count: (r.distinct_accounts ?? 10) - 1,
			})

			await evaluateRules(IP, 'login_failed')

			const credBanCall = mockCreateBan.mock.calls.find(([, name]) => name === r.name)

			expect(credBanCall).toBeUndefined()
		})

		it('triggers when both event_count and distinct_accounts thresholds are met', async () => {
			mockDbOne.mockResolvedValue({
				event_count: r.threshold,
				account_count: r.distinct_accounts ?? 10,
			})

			await evaluateRules(IP, 'login_failed')

			const credBanCall = mockCreateBan.mock.calls.find(([, name]) => name === r.name)

			expect(credBanCall).toBeDefined()
		})
	})

	describe('event_type filtering', () => {
		it('runs only rules whose event_type matches', async () => {
			mockDbOne.mockResolvedValue({ event_count: 9999, account_count: 9999 })

			await evaluateRules(IP, 'rate_limited')

			// Only rate_limit_abuse listens for 'rate_limited'.
			expect(mockCreateBan).toHaveBeenCalledTimes(1)

			expect(mockCreateBan.mock.calls[0][1]).toBe('Rate Limit Abuse Detection')
		})

		it('skips evaluation entirely when no rule matches the event_type', async () => {
			await evaluateRules(IP, 'unknown_event_type')

			expect(mockDbOne).not.toHaveBeenCalled()

			expect(mockCreateBan).not.toHaveBeenCalled()
		})
	})

	describe('threat action_taken format', () => {
		it('renders durations >= 60min as hours', async () => {
			const r = rule('brute_force') // 60min ban → "1h"

			mockDbOne.mockResolvedValue({ event_count: r.threshold, account_count: 1 })

			await evaluateRules(IP, 'login_failed')

			const threatArg = mockCreateThreat.mock.calls.find(
				([t]) => (t as { threat_type: string }).threat_type === r.id,
			)?.[0] as { action_taken: string }

			expect(threatArg.action_taken).toMatch(/^Banned for \d+h$/)
		})
	})
})
