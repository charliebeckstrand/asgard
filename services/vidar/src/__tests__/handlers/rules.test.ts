const { mockTx, mockBanForAtLeast, mockCreateThreat } = vi.hoisted(() => ({
	mockTx: { one: vi.fn(), exec: vi.fn() },
	mockBanForAtLeast: vi.fn(),
	mockCreateThreat: vi.fn(),
}))

vi.mock('../../lib/db.js', () => ({
	db: { tx: (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx) },
}))

vi.mock('../../handlers/bans.js', () => ({
	banForAtLeast: (...args: unknown[]) => mockBanForAtLeast(...args),
}))

vi.mock('../../handlers/threats.js', () => ({
	createThreat: (...args: unknown[]) => mockCreateThreat(...args),
}))

vi.mock('../../lib/log.js', () => ({
	logger: () => ({ warn: vi.fn() }),
}))

import { evaluateRules, RULES } from '@/handlers/rules'

const IP = '203.0.113.42'

beforeEach(() => {
	vi.clearAllMocks()

	mockBanForAtLeast.mockResolvedValue(true)
})

function rule(id: string) {
	const found = RULES.find((r) => r.id === id)

	if (!found) throw new Error(`unknown rule ${id}`)

	return found
}

function threatTypes() {
	return mockCreateThreat.mock.calls.map(([, threat]) => threat.threat_type)
}

describe('evaluateRules', () => {
	it('locks the address before it counts', async () => {
		mockTx.one.mockResolvedValue({ event_count: 0, account_count: 0 })

		await evaluateRules(IP, 'login_failed')

		expect(mockTx.exec.mock.invocationCallOrder[0]).toBeLessThan(
			mockTx.one.mock.invocationCallOrder[0] ?? 0,
		)
	})

	it('bans and records a threat when the count meets the threshold', async () => {
		const r = rule('brute_force')

		mockTx.one.mockResolvedValue({ event_count: r.threshold, account_count: 1 })

		await evaluateRules(IP, 'login_failed')

		expect(mockBanForAtLeast).toHaveBeenCalledWith(mockTx, IP, 60, {
			reason: r.name,
			rule_id: r.id,
		})

		expect(mockCreateThreat).toHaveBeenCalledWith(
			mockTx,
			expect.objectContaining({ threat_type: r.id, ip: IP, action_taken: 'Banned for 1h' }),
		)
	})

	it('does nothing below the threshold', async () => {
		mockTx.one.mockResolvedValue({
			event_count: rule('brute_force').threshold - 1,
			account_count: 1,
		})

		await evaluateRules(IP, 'login_failed')

		expect(mockCreateThreat).not.toHaveBeenCalled()
	})

	it('needs enough distinct accounts for credential stuffing', async () => {
		const r = rule('credential_stuffing')

		mockTx.one.mockResolvedValue({
			event_count: r.threshold,
			account_count: (r.distinct_accounts ?? 0) - 1,
		})

		await evaluateRules(IP, 'login_failed')

		expect(threatTypes()).toEqual(['brute_force'])
	})

	it('runs only the rules that watch the event type', async () => {
		mockTx.one.mockResolvedValue({ event_count: 9999, account_count: 9999 })

		await evaluateRules(IP, 'rate_limited')

		expect(threatTypes()).toEqual(['rate_limit_abuse'])
	})

	it('opens no transaction when no rule watches the event type', async () => {
		await evaluateRules(IP, 'unknown_event_type')

		expect(mockTx.exec).not.toHaveBeenCalled()
	})

	it('records a threat without a ban when a longer one is in force', async () => {
		mockBanForAtLeast.mockResolvedValue(false)

		mockTx.one.mockResolvedValue({ event_count: 9999, account_count: 0 })

		await evaluateRules(IP, 'rate_limited')

		expect(mockCreateThreat).toHaveBeenCalledWith(
			mockTx,
			expect.objectContaining({ action_taken: 'Already banned for longer' }),
		)
	})
})
