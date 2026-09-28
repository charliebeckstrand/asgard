import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { isDockerAvailable } from 'vali/containers'
import type { MfaRepository, PasskeyRepository, UserRepository } from '../../auth/types.js'
import { promote, resetSecondFactors } from '../admins.js'
import { createMfaRepository } from '../mfa-repository.js'
import { createPasskeyRepository } from '../passkey-repository.js'
import { createUserRepository } from '../user-repository.js'
import { startTestDb, type TestDb } from './test-db.js'

let testDb: TestDb
let pool: Pool
let users: UserRepository
let passkeys: PasskeyRepository
let mfa: MfaRepository

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startTestDb()

	pool = testDb.pool

	users = createUserRepository(testDb.db)

	passkeys = createPasskeyRepository(testDb.db)

	mfa = createMfaRepository(testDb.db)
}, 60_000)

afterAll(async () => {
	await testDb?.stop()
})

beforeEach(async () => {
	if (!isDockerAvailable()) return

	await testDb.reset()
})

const secret = new Uint8Array([1, 2, 3])

async function insertUser(email = `${randomUUID()}@x.dev`) {
	return (await users.insertUser(email, 'h')).id
}

async function addTotp(userId: string) {
	await mfa.setPendingTotp(userId, secret)

	await mfa.confirmTotp(userId, 100)
}

async function makeAdmin(userId: string) {
	await pool.query(`UPDATE users SET roles = '{user,admin}' WHERE id = $1`, [userId])
}

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('createMfaRepository (integration)', () => {
	describe('authenticator app', () => {
		it('stays off until confirmed', async () => {
			const userId = await insertUser()

			expect(await mfa.setPendingTotp(userId, secret)).toBe('created')

			expect(await mfa.getTotp(userId)).toEqual({ secret, last_step: 0, confirmed: false })

			expect(await mfa.getFactors(userId)).toEqual({ passkeys: 0, totp: false, recovery_codes: 0 })

			expect(await mfa.confirmTotp(userId, 100)).toBe(true)

			expect(await mfa.getTotp(userId)).toMatchObject({ last_step: 100, confirmed: true })

			expect(await mfa.getFactors(userId)).toMatchObject({ totp: true })
		})

		it('replaces a pending secret but never a confirmed one', async () => {
			const userId = await insertUser()

			await mfa.setPendingTotp(userId, secret)

			expect(await mfa.setPendingTotp(userId, new Uint8Array([9]))).toBe('created')

			expect((await mfa.getTotp(userId))?.secret).toEqual(new Uint8Array([9]))

			await mfa.confirmTotp(userId, 100)

			expect(await mfa.setPendingTotp(userId, secret)).toBe('exists')

			expect((await mfa.getTotp(userId))?.secret).toEqual(new Uint8Array([9]))
		})

		it('confirms only once', async () => {
			const userId = await insertUser()

			await addTotp(userId)

			expect(await mfa.confirmTotp(userId, 200)).toBe(false)
		})

		it('uses each step once, and never an older one', async () => {
			const userId = await insertUser()

			await addTotp(userId)

			expect(await mfa.useTotpStep(userId, 101)).toBe(true)

			expect(await mfa.useTotpStep(userId, 101)).toBe(false)

			expect(await mfa.useTotpStep(userId, 100)).toBe(false)

			expect(await mfa.useTotpStep(userId, 102)).toBe(true)
		})

		it('never uses a step of an unconfirmed secret', async () => {
			const userId = await insertUser()

			await mfa.setPendingTotp(userId, secret)

			expect(await mfa.useTotpStep(userId, 101)).toBe(false)
		})
	})

	describe('getLatestSecret', () => {
		it('returns null when no one has a secret', async () => {
			expect(await mfa.getLatestSecret()).toBeNull()
		})

		it('returns a stored secret, pending or confirmed', async () => {
			await mfa.setPendingTotp(await insertUser(), secret)

			expect(await mfa.getLatestSecret()).toEqual(secret)
		})
	})

	describe('removing second factors', () => {
		it('removes an authenticator app, and the recovery codes with the last factor', async () => {
			const userId = await insertUser()

			await addTotp(userId)

			await mfa.replaceRecoveryCodes(userId, ['a', 'b'])

			expect(await mfa.deleteTotp(userId)).toBe('deleted')

			expect(await mfa.getFactors(userId)).toEqual({ passkeys: 0, totp: false, recovery_codes: 0 })
		})

		it('keeps the recovery codes while a passkey is left', async () => {
			const userId = await insertUser()

			await addTotp(userId)

			await passkeys.insertPasskey(userId, {
				id: 'p1',
				publicKey: new Uint8Array([1]),
				counter: 0,
				transports: [],
			})

			await mfa.replaceRecoveryCodes(userId, ['a'])

			expect(await mfa.deleteTotp(userId)).toBe('deleted')

			expect(await mfa.getFactors(userId)).toEqual({ passkeys: 1, totp: false, recovery_codes: 1 })
		})

		it('reports not_found without a confirmed app', async () => {
			const userId = await insertUser()

			await mfa.setPendingTotp(userId, secret)

			expect(await mfa.deleteTotp(userId)).toBe('not_found')
		})

		it("keeps an admin's last factor, whichever kind it is", async () => {
			const adminId = await insertUser()

			await addTotp(adminId)

			await makeAdmin(adminId)

			expect(await mfa.deleteTotp(adminId)).toBe('last_admin_factor')

			await passkeys.insertPasskey(adminId, {
				id: 'p1',
				publicKey: new Uint8Array([1]),
				counter: 0,
				transports: [],
			})

			expect(await mfa.deleteTotp(adminId)).toBe('deleted')

			expect(await passkeys.deletePasskey('p1', adminId)).toBe('last_admin_factor')
		})
	})

	describe('recovery codes', () => {
		it('replaces the whole set, and uses each code once', async () => {
			const userId = await insertUser()

			await mfa.replaceRecoveryCodes(userId, ['a', 'b'])

			await mfa.replaceRecoveryCodes(userId, ['c'])

			expect(await mfa.useRecoveryCode(userId, 'a')).toBe(false)

			expect(await mfa.useRecoveryCode(userId, 'c')).toBe(true)

			expect(await mfa.useRecoveryCode(userId, 'c')).toBe(false)
		})

		it("never uses another user's code", async () => {
			const alice = await insertUser()

			const bob = await insertUser()

			await mfa.replaceRecoveryCodes(alice, ['a'])

			expect(await mfa.useRecoveryCode(bob, 'a')).toBe(false)
		})
	})

	describe('countFailedStep', () => {
		it('counts tries up to the limit, then makes the next one wait', async () => {
			const userId = await insertUser()

			for (let i = 0; i < 3; i++) {
				expect(await mfa.countFailedStep(userId, 3, 60)).toBe(true)
			}

			expect(await mfa.countFailedStep(userId, 3, 60)).toBe(false)

			const { rows } = await pool.query('SELECT count FROM failed_steps WHERE user_id = $1', [
				userId,
			])

			expect(rows[0].count).toBe(3)
		})

		it('lets a try through once the wait is over', async () => {
			const userId = await insertUser()

			await mfa.countFailedStep(userId, 1, 60)

			await pool.query(
				`UPDATE failed_steps SET last_failed_at = now() - interval '61 seconds' WHERE user_id = $1`,
				[userId],
			)

			expect(await mfa.countFailedStep(userId, 1, 60)).toBe(true)

			expect(await mfa.countFailedStep(userId, 1, 60)).toBe(false)
		})

		it('counts each user apart', async () => {
			const alice = await insertUser()

			const bob = await insertUser()

			await mfa.countFailedStep(alice, 1, 60)

			expect(await mfa.countFailedStep(bob, 1, 60)).toBe(true)
		})

		it('starts over after clearFailedSteps', async () => {
			const userId = await insertUser()

			await mfa.countFailedStep(userId, 1, 60)

			await mfa.clearFailedSteps(userId)

			expect(await mfa.countFailedStep(userId, 1, 60)).toBe(true)
		})
	})

	describe('deleteStaleFailedSteps', () => {
		it('deletes only counts older than the given age', async () => {
			const old = await insertUser()

			const recent = await insertUser()

			await mfa.countFailedStep(old, 5, 60)

			await mfa.countFailedStep(recent, 5, 60)

			await pool.query(
				`UPDATE failed_steps SET last_failed_at = now() - interval '2 days' WHERE user_id = $1`,
				[old],
			)

			expect(await mfa.deleteStaleFailedSteps(24 * 60 * 60)).toBe(1)

			const { rows } = await pool.query('SELECT user_id FROM failed_steps')

			expect(rows).toEqual([{ user_id: recent }])
		})
	})
})

describeWithDocker('admins (integration)', () => {
	it('promotes a user whose only second factor is an authenticator app', async () => {
		const userId = await insertUser('carol@x.dev')

		await pool.query('UPDATE users SET is_verified = true WHERE id = $1', [userId])

		await addTotp(userId)

		expect(await promote(testDb.db, 'carol@x.dev')).toBe('promoted')
	})

	it('resets every second factor and session of an admin', async () => {
		const adminId = await insertUser('dave@x.dev')

		await addTotp(adminId)

		await passkeys.insertPasskey(adminId, {
			id: 'p1',
			publicKey: new Uint8Array([1]),
			counter: 0,
			transports: [],
		})

		await mfa.replaceRecoveryCodes(adminId, ['a'])

		await makeAdmin(adminId)

		await pool.query(
			"INSERT INTO sessions (id, user_id, expires_at) VALUES ('s1', $1, now() + interval '1 day')",
			[adminId],
		)

		const bystanderId = await insertUser()

		await addTotp(bystanderId)

		expect(await resetSecondFactors(testDb.db, 'Dave@x.dev')).toBe('reset')

		expect(await mfa.getFactors(adminId)).toEqual({ passkeys: 0, totp: false, recovery_codes: 0 })

		expect(
			(await pool.query('SELECT 1 FROM sessions WHERE user_id = $1', [adminId])).rowCount,
		).toBe(0)

		expect((await users.getUserById(adminId))?.roles).toEqual(['user', 'admin'])

		expect(await mfa.getFactors(bystanderId)).toMatchObject({ totp: true })
	})

	it('reports an unknown email on reset', async () => {
		expect(await resetSecondFactors(testDb.db, 'nobody@x.dev')).toBe('not_found')
	})
})
