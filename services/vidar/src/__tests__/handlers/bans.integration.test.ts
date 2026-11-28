import { stubServiceEnv } from 'vali/env'

stubServiceEnv({ VIDAR_API_KEY: 'test-vidar-api-key-that-is-at-least-32-chars' })

import { sql } from 'saga'
import { isDockerAvailable } from 'vali/containers'
import { cleanExpiredBans, isIpBanned, removeBan } from '@/handlers/bans'
import { purgeOldEvents } from '@/handlers/events'
import { purgeOldThreats } from '@/handlers/threats'
import { db } from '@/lib/db'
import { insertEvents, resetTables, startTestDb } from '../test-db.js'

const IP = '203.0.113.42'

let stopDb: (() => Promise<void>) | undefined

beforeAll(async () => {
	if (!isDockerAvailable()) return

	stopDb = await startTestDb()
}, 60_000)

afterAll(async () => {
	await stopDb?.()
})

beforeEach(async () => {
	if (!isDockerAvailable()) return

	await resetTables()
})

async function insertBan(ip: string, expiresIn: string | null) {
	await db.exec(sql`
		INSERT INTO vdr_bans (ip, reason, created_by, expires_at)
		VALUES (${ip}, 'Test', 'vidar', ${expiresIn === null ? null : sql`now() + ${expiresIn}::interval`})
	`)
}

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('bans (integration)', () => {
	it('reads an active ban as banned', async () => {
		await insertBan(IP, '1 hour')

		expect(await isIpBanned(IP)).toMatchObject({ banned: true, reason: 'Test' })
	})

	it('reads a permanent ban as banned with no expiry', async () => {
		await insertBan(IP, null)

		expect(await isIpBanned(IP)).toEqual({ banned: true, reason: 'Test', expires_at: undefined })
	})

	it('reads an expired ban as not banned', async () => {
		await insertBan(IP, '-1 minute')

		expect(await isIpBanned(IP)).toEqual({ banned: false })
	})

	it('cleans only the expired bans', async () => {
		await insertBan(IP, '-1 minute')

		await insertBan('203.0.113.43', '1 hour')

		await insertBan('203.0.113.44', null)

		expect(await cleanExpiredBans()).toBe(1)

		expect(await isIpBanned('203.0.113.43')).toMatchObject({ banned: true })

		expect(await isIpBanned('203.0.113.44')).toMatchObject({ banned: true })
	})

	it('lifts a ban in force', async () => {
		await insertBan(IP, '1 hour')

		expect(await removeBan(IP)).toBe(true)

		expect(await isIpBanned(IP)).toEqual({ banned: false })
	})

	it('finds no ban to lift once it has expired', async () => {
		await insertBan(IP, '-1 minute')

		expect(await removeBan(IP)).toBe(false)
	})
})

describeWithDocker('retention (integration)', () => {
	it('purges events older than the retention', async () => {
		await insertEvents(IP, 'login_failed', 2, { minutesAgo: 25 * 60 })

		await insertEvents(IP, 'login_failed', 1)

		expect(await purgeOldEvents(1)).toBe(2)
	})

	it('purges threats older than the retention', async () => {
		await db.exec(sql`
			INSERT INTO vdr_threats (threat_type, ip, created_at)
			VALUES
				('brute_force', ${IP}, now() - interval '31 days'),
				('brute_force', ${IP}, now())
		`)

		expect(await purgeOldThreats(30)).toBe(1)
	})
})
