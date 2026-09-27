import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { isDockerAvailable } from 'vali/containers'
import type { ActivityRepository, UserRepository } from '../../auth/types.js'
import { createActivityRepository } from '../activity-repository.js'
import { demote } from '../admins.js'
import { createUserRepository } from '../user-repository.js'
import { startTestDb, type TestDb } from './test-db.js'

let testDb: TestDb
let pool: Pool
let users: UserRepository
let activity: ActivityRepository

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startTestDb()

	pool = testDb.pool

	users = createUserRepository(testDb.db)

	activity = createActivityRepository(testDb.db)
}, 60_000)

afterAll(async () => {
	await testDb?.stop()
})

beforeEach(async () => {
	if (!isDockerAvailable()) return

	await testDb.reset()
})

async function insertUser(email = `${randomUUID()}@x.dev`) {
	return (await users.insertUser(email, 'hash')).id
}

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('createActivityRepository (integration)', () => {
	it('lists what happened to the user, newest first', async () => {
		const userId = await insertUser()

		const adminId = await insertUser()

		await activity.record({
			userId,
			actorId: userId,
			action: 'signed_in',
			detail: 'password',
			ip: '203.0.113.7',
		})

		await activity.record({ userId, actorId: adminId, action: 'deactivated' })

		await activity.record({ userId: adminId, actorId: adminId, action: 'signed_in' })

		const listed = await activity.listActivity(userId, 50)

		expect(listed.map((entry) => entry.action)).toEqual(['deactivated', 'signed_in'])

		expect(listed[1]).toEqual({
			id: expect.any(String),
			action: 'signed_in',
			detail: 'password',
			actor_id: userId,
			ip: '203.0.113.7',
			created_at: expect.any(String),
		})

		expect(listed[0]).toMatchObject({ actor_id: adminId, detail: null, ip: null })
	})

	it('lists at most `limit` entries', async () => {
		const userId = await insertUser()

		for (let i = 0; i < 3; i++) {
			await activity.record({ userId, actorId: userId, action: 'signed_in' })
		}

		expect(await activity.listActivity(userId, 2)).toHaveLength(2)
	})

	it('keeps the entry when the admin who acted is gone', async () => {
		const userId = await insertUser()

		const adminId = await insertUser()

		await activity.record({ userId, actorId: adminId, action: 'deactivated' })

		await pool.query('DELETE FROM users WHERE id = $1', [adminId])

		expect(await activity.listActivity(userId, 50)).toMatchObject([
			{ action: 'deactivated', actor_id: null },
		])
	})

	it('deletes entries older than the given age', async () => {
		const userId = await insertUser()

		await activity.record({ userId, actorId: userId, action: 'signed_in' })

		await activity.record({ userId, actorId: userId, action: 'email_verified' })

		await pool.query(
			"UPDATE activity SET created_at = now() - interval '91 days' WHERE action = 'signed_in'",
		)

		expect(await activity.deleteOldActivity(90)).toBe(1)

		expect(await activity.listActivity(userId, 50)).toMatchObject([{ action: 'email_verified' }])
	})

	it('records what the operator did, with no actor', async () => {
		const userId = await insertUser('erin@x.dev')

		expect(await demote(testDb.db, 'erin@x.dev')).toBe('demoted')

		expect(await activity.listActivity(userId, 50)).toMatchObject([
			{ action: 'demoted', actor_id: null },
		])
	})
})
