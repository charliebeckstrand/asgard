import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { createDb, type Db, migrate } from 'saga'
import { isDockerAvailable, startPostgres, type TestDatabase } from 'vali/containers'
import { stubServiceEnv } from 'vali/env'
import type {
	OAuthRepository,
	PasskeyRepository,
	StoredOAuthState,
	UserRepository,
} from '../../auth/types.js'

stubServiceEnv()

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations')

let testDb: TestDatabase
let pool: Pool
let db: Db
let users: UserRepository
let passkeys: PasskeyRepository
let oauth: OAuthRepository

beforeAll(async () => {
	if (!isDockerAvailable()) return

	testDb = await startPostgres()

	pool = new Pool({ connectionString: testDb.connectionUri })

	await migrate({ url: testDb.connectionUri }, migrationsDir)

	db = createDb(() => ({ url: testDb.connectionUri }))

	vi.doMock('../db.js', () => ({ db }))

	users = (await import('../user-repository.js')).createUserRepository()

	passkeys = (await import('../passkey-repository.js')).createPasskeyRepository()

	oauth = (await import('../oauth-repository.js')).createOAuthRepository()
}, 60_000)

afterAll(async () => {
	await db?.close()

	await pool?.end()

	await testDb?.stop()
})

beforeEach(async () => {
	if (!isDockerAvailable()) return

	await pool.query('TRUNCATE users, oauth_states CASCADE')
})

const state: StoredOAuthState = {
	provider: 'github',
	verifier: 'verifier',
	origin: 'https://admin.ivoryimage.dev',
	return_to: '/users',
	user_id: null,
}

const inAMinute = () => new Date(Date.now() + 60_000)

async function insertUser(email = `${randomUUID()}@x.dev`) {
	return (await users.insertUser(email, 'h')).id
}

async function makeSsoUser(email = `${randomUUID()}@x.dev`, subject: string = randomUUID()) {
	const created = await oauth.createUserWithIdentity({ provider: 'github', subject, email })

	if (created === 'email_exists') throw new Error('email exists')

	return created.userId
}

const describeWithDocker = isDockerAvailable() ? describe : describe.skip

describeWithDocker('createOAuthRepository (integration)', () => {
	describe('states', () => {
		it('returns a live state once', async () => {
			await oauth.createState('s1', state, inAMinute())

			expect(await oauth.useState('s1')).toEqual(state)

			expect(await oauth.useState('s1')).toBeNull()
		})

		it('ignores and sweeps an expired state', async () => {
			await oauth.createState('s1', state, new Date(Date.now() - 1000))

			expect(await oauth.useState('s1')).toBeNull()

			await oauth.createState('s2', state, new Date(Date.now() - 1000))

			await oauth.createState('s3', state, inAMinute())

			expect(await oauth.deleteExpiredStates()).toBe(2)

			expect(await oauth.useState('s3')).toEqual(state)
		})
	})

	describe('createUserWithIdentity', () => {
		it('makes a verified user with no password and the identity', async () => {
			const userId = await makeSsoUser('carol@x.dev', 'gh-1')

			expect(await oauth.findIdentityUser('github', 'gh-1')).toBe(userId)

			expect(await users.getUserById(userId)).toMatchObject({
				email: 'carol@x.dev',
				is_verified: true,
				role: 'user',
			})

			expect(await users.getCredentialsByEmail('carol@x.dev')).toMatchObject({
				hashed_password: null,
			})
		})

		it('refuses an email that a user has, and adds nothing', async () => {
			await insertUser('dave@x.dev')

			expect(
				await oauth.createUserWithIdentity({
					provider: 'google',
					subject: 'g-1',
					email: 'dave@x.dev',
				}),
			).toBe('email_exists')

			expect(await oauth.findIdentityUser('google', 'g-1')).toBeNull()
		})
	})

	describe('linkIdentity', () => {
		const identity = { provider: 'google' as const, subject: 'g-1', email: 'erin@x.dev' }

		it('gives the identity to the user, and again is a no-op', async () => {
			const userId = await insertUser()

			expect(await oauth.linkIdentity(userId, identity)).toBe('linked')

			expect(await oauth.linkIdentity(userId, identity)).toBe('linked')

			expect(await oauth.getIdentities(userId)).toEqual([
				{ provider: 'google', email: 'erin@x.dev', created_at: expect.anything() },
			])
		})

		it('refuses an identity that another user has', async () => {
			await oauth.linkIdentity(await insertUser(), identity)

			expect(await oauth.linkIdentity(await insertUser(), identity)).toBe('in_use')
		})

		it('refuses a second account of the same provider', async () => {
			const userId = await insertUser()

			await oauth.linkIdentity(userId, identity)

			expect(await oauth.linkIdentity(userId, { ...identity, subject: 'g-2' })).toBe(
				'provider_linked',
			)
		})
	})

	describe('unlinkIdentity', () => {
		it('removes an identity from a user with a password', async () => {
			const userId = await insertUser()

			await oauth.linkIdentity(userId, { provider: 'github', subject: 'gh-1', email: null })

			expect(await oauth.unlinkIdentity(userId, 'github')).toBe('deleted')

			expect(await oauth.findIdentityUser('github', 'gh-1')).toBeNull()
		})

		it('reports an identity the user does not have', async () => {
			expect(await oauth.unlinkIdentity(await insertUser(), 'google')).toBe('not_found')
		})

		it('keeps the only way to sign in', async () => {
			const userId = await makeSsoUser()

			expect(await oauth.unlinkIdentity(userId, 'github')).toBe('last_sign_in')
		})

		it('lets a user without a password go when another identity or a passkey is left', async () => {
			const userId = await makeSsoUser()

			await oauth.linkIdentity(userId, { provider: 'google', subject: 'g-1', email: null })

			expect(await oauth.unlinkIdentity(userId, 'github')).toBe('deleted')

			await passkeys.insertPasskey(userId, {
				id: 'p1',
				publicKey: new Uint8Array([1]),
				counter: 0,
				transports: [],
			})

			expect(await oauth.unlinkIdentity(userId, 'google')).toBe('deleted')
		})
	})
})
