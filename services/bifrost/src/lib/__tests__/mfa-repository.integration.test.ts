import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { createDb, type Db, migrate } from 'saga'
import { isDockerAvailable, startPostgres, type TestDatabase } from 'vali/containers'
import { stubServiceEnv } from 'vali/env'
import type { MfaRepository, PasskeyRepository, UserRepository } from '../../auth/types.js'

stubServiceEnv()

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations')

let testDb: TestDatabase
let pool: Pool
let db: Db
let users: UserRepository
let passkeys: PasskeyRepository
let mfa: MfaRepository
let admins: typeof import('../admins.js')

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startPostgres()

	pool = new Pool({ connectionString: testDb.connectionUri })

	await migrate({ url: testDb.connectionUri }, migrationsDir)

	db = createDb(() => ({ url: testDb.connectionUri }))

	vi.doMock('../db.js', () => ({ db }))

	users = (await import('../user-repository.js')).createUserRepository()

	passkeys = (await import('../passkey-repository.js')).createPasskeyRepository()

	mfa = (await import('../mfa-repository.js')).createMfaRepository()

	admins = await import('../admins.js')
}, 60_000)

afterAll(async () => {
	await db?.close()

	await pool?.end()

	await testDb?.stop()
})

beforeEach(async () => {
	if (!isDockerAvailable()) return

	await pool.query('TRUNCATE users CASCADE')
})

const inAMinute = () => new Date(Date.now() + 60_000)

const secret = new Uint8Array([1, 2, 3])

async function insertUser(email = `${randomUUID()}@x.dev`) {
	return (await users.insertUser(email, 'h')).id
}

async function addTotp(userId: string) {
	await mfa.setPendingTotp(userId, secret)

	await mfa.confirmTotp(userId, 100)
}

async function makeAdmin(userId: string) {
	await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [userId])
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

	describe('login tickets', () => {
		it('spends one attempt per use, up to the limit', async () => {
			const userId = await insertUser()

			await mfa.createTicket('t1', userId, inAMinute())

			for (let i = 0; i < 3; i++) {
				expect(await mfa.useTicketAttempt('t1', 3)).toBe(userId)
			}

			expect(await mfa.useTicketAttempt('t1', 3)).toBeNull()

			expect(await mfa.findTicket('t1', 3)).toBeNull()
		})

		it('finds a live ticket without spending an attempt', async () => {
			const userId = await insertUser()

			await mfa.createTicket('t1', userId, inAMinute())

			expect(await mfa.findTicket('t1', 1)).toBe(userId)

			expect(await mfa.useTicketAttempt('t1', 1)).toBe(userId)
		})

		it('never uses an expired or deleted ticket', async () => {
			const userId = await insertUser()

			await mfa.createTicket('old', userId, new Date(Date.now() - 1000))

			await mfa.createTicket('gone', userId, inAMinute())

			await mfa.deleteTicket('gone')

			expect(await mfa.useTicketAttempt('old', 5)).toBeNull()

			expect(await mfa.useTicketAttempt('gone', 5)).toBeNull()

			expect(await mfa.deleteExpiredTickets()).toBe(1)
		})

		it('lets concurrent tries spend no more than the limit', async () => {
			const userId = await insertUser()

			await mfa.createTicket('t1', userId, inAMinute())

			const results = await Promise.all(
				Array.from({ length: 10 }, () => mfa.useTicketAttempt('t1', 5)),
			)

			expect(results.filter(Boolean)).toHaveLength(5)
		})
	})
})

describeWithDocker('admins (integration)', () => {
	it('promotes a user whose only second factor is an authenticator app', async () => {
		const userId = await insertUser('carol@x.dev')

		await addTotp(userId)

		expect(await admins.promote('carol@x.dev')).toBe('promoted')
	})

	it('resets every second factor, session, and pending sign-in of an admin', async () => {
		const adminId = await insertUser('dave@x.dev')

		await addTotp(adminId)

		await passkeys.insertPasskey(adminId, {
			id: 'p1',
			publicKey: new Uint8Array([1]),
			counter: 0,
			transports: [],
		})

		await mfa.replaceRecoveryCodes(adminId, ['a'])

		await mfa.createTicket('t1', adminId, inAMinute())

		await makeAdmin(adminId)

		await pool.query(
			"INSERT INTO sessions (id, user_id, expires_at) VALUES ('s1', $1, now() + interval '1 day')",
			[adminId],
		)

		const bystanderId = await insertUser()

		await addTotp(bystanderId)

		expect(await admins.resetSecondFactors('Dave@x.dev')).toBe('reset')

		expect(await mfa.getFactors(adminId)).toEqual({ passkeys: 0, totp: false, recovery_codes: 0 })

		expect(await mfa.findTicket('t1', 5)).toBeNull()

		expect(
			(await pool.query('SELECT 1 FROM sessions WHERE user_id = $1', [adminId])).rowCount,
		).toBe(0)

		expect((await users.getUserById(adminId))?.role).toBe('admin')

		expect(await mfa.getFactors(bystanderId)).toMatchObject({ totp: true })
	})

	it('reports an unknown email on reset', async () => {
		expect(await admins.resetSecondFactors('nobody@x.dev')).toBe('not_found')
	})
})
