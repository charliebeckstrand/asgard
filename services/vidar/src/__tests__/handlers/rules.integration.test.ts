import { stubServiceEnv } from 'vali/env'

stubServiceEnv({ VIDAR_API_KEY: 'test-vidar-api-key-that-is-at-least-32-chars' })

import { sql } from 'saga'
import { dockerAvailable } from 'vali/containers'
import { evaluateRules } from '../../handlers/rules.js'
import { db } from '../../lib/db.js'
import { insertEvents, resetTables, startTestDb } from '../test-db.js'

const IP = '203.0.113.42'

let stopDb: (() => Promise<void>) | undefined

async function threats() {
	return db.many<{ threat_type: string; action_taken: string | null }>(
		sql`SELECT threat_type, action_taken FROM vdr_threats WHERE ip = ${IP} ORDER BY threat_type`,
	)
}

async function ban() {
	return db.first<{ rule_id: string | null; minutes_left: number | null }>(sql`
		SELECT rule_id, round(extract(epoch FROM expires_at - now()) / 60)::int AS minutes_left
		FROM vdr_bans
		WHERE ip = ${IP}
	`)
}

describe.skipIf(!dockerAvailable)('evaluateRules (integration)', () => {
	beforeAll(async () => {
		stopDb = await startTestDb()
	}, 60_000)

	afterAll(async () => {
		await stopDb?.()
	})

	beforeEach(async () => {
		await resetTables()
	})

	describe('brute_force', () => {
		it('bans for an hour at ten failed sign-ins', async () => {
			await insertEvents(IP, 'login_failed', 10, { email: () => 'a@example.com' })

			await evaluateRules(IP, 'login_failed')

			expect(await threats()).toEqual([
				{ threat_type: 'brute_force', action_taken: 'Banned for 1h' },
			])

			expect(await ban()).toEqual({ rule_id: 'brute_force', minutes_left: 60 })
		})

		it('does nothing below the threshold', async () => {
			await insertEvents(IP, 'login_failed', 9)

			await evaluateRules(IP, 'login_failed')

			expect(await threats()).toEqual([])

			expect(await ban()).toBeNull()
		})

		it('ignores events outside its window', async () => {
			await insertEvents(IP, 'login_failed', 10, { minutesAgo: 20 })

			await evaluateRules(IP, 'login_failed')

			expect(await threats()).toEqual([])
		})

		it('does not count a burst again once it has made a threat', async () => {
			await insertEvents(IP, 'login_failed', 10)

			await evaluateRules(IP, 'login_failed')

			await evaluateRules(IP, 'login_failed')

			expect(await threats()).toHaveLength(1)
		})

		it('makes one threat when two events evaluate at once', async () => {
			await insertEvents(IP, 'login_failed', 10)

			await Promise.all([evaluateRules(IP, 'login_failed'), evaluateRules(IP, 'login_failed')])

			expect(await threats()).toHaveLength(1)
		})
	})

	describe('credential_stuffing', () => {
		it('bans for a day across ten accounts', async () => {
			await insertEvents(IP, 'login_failed', 15, { email: (n) => `user${n % 10}@example.com` })

			await evaluateRules(IP, 'login_failed')

			expect((await threats()).map((t) => t.threat_type)).toEqual([
				'brute_force',
				'credential_stuffing',
			])

			expect(await ban()).toEqual({ rule_id: 'credential_stuffing', minutes_left: 1440 })
		})

		it('does not count events that name no account', async () => {
			await insertEvents(IP, 'login_failed', 15, {
				email: (n) => (n < 9 ? `user${n}@example.com` : undefined),
			})

			await evaluateRules(IP, 'login_failed')

			expect((await threats()).map((t) => t.threat_type)).toEqual(['brute_force'])
		})
	})

	describe('existing bans', () => {
		it('keeps a permanent ban', async () => {
			await db.exec(sql`
				INSERT INTO vdr_bans (ip, reason, created_by) VALUES (${IP}, 'Permanent', 'manual')
			`)

			await insertEvents(IP, 'login_failed', 10)

			await evaluateRules(IP, 'login_failed')

			expect(await threats()).toEqual([
				{ threat_type: 'brute_force', action_taken: 'Already banned for longer' },
			])

			expect(await ban()).toEqual({ rule_id: null, minutes_left: null })
		})

		it('extends a shorter ban', async () => {
			await db.exec(sql`
				INSERT INTO vdr_bans (ip, reason, created_by, expires_at)
				VALUES (${IP}, 'Short', 'vidar', now() + interval '5 minutes')
			`)

			await insertEvents(IP, 'login_failed', 10)

			await evaluateRules(IP, 'login_failed')

			expect(await ban()).toEqual({ rule_id: 'brute_force', minutes_left: 60 })
		})
	})
})
