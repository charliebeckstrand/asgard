import { createHash } from 'node:crypto'
import type { Session } from 'skuld'
import { configure } from '../config.js'
import {
	createSession,
	deleteUserSessions,
	findSession,
	hashToken,
	MAX_SESSIONS_PER_USER,
	SESSION_TTL_SECONDS,
} from '../sessions.js'
import type {
	ActivityRepository,
	EmailTokenRepository,
	MfaRepository,
	OAuthRepository,
	PasskeyRepository,
	SessionRepository,
	UserRepository,
} from '../types.js'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const session: Session = {
	id: 'hash',
	created_at: '2026-09-26T00:00:00.000Z',
	expires_at: '2026-10-26T00:00:00.000Z',
	two_step: false,
	user: {
		id: USER_ID,
		email: 'alice@example.com',
		name: null,
		is_active: true,
		is_verified: true,
		roles: ['user'],
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-01T00:00:00.000Z',
	},
}

let sessionRepository: SessionRepository

beforeEach(() => {
	sessionRepository = {
		createSession: vi.fn().mockResolvedValue(session),
		findSession: vi.fn().mockResolvedValue(session),
		deleteSession: vi.fn(),
		deleteUserSessions: vi.fn(),
		deleteExpiredSessions: vi.fn(),
		passSecondStep: vi.fn(),
		failSecondStep: vi.fn(),
	}

	configure({
		userRepository: {} as UserRepository,
		sessionRepository,
		passkeyRepository: {} as PasskeyRepository,
		passkeys: { domain: 'localhost', origins: ['http://localhost:3000'] },
		mfaRepository: {} as MfaRepository,
		mfa: { issuer: 'localhost' },
		oauthRepository: {} as OAuthRepository,
		emailTokenRepository: {} as EmailTokenRepository,
		activityRepository: {} as ActivityRepository,
		sendEmail: vi.fn(),
		oauth: {},
	})
})

describe('hashToken', () => {
	it('is the hex SHA-256 of the token', () => {
		expect(hashToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'))
	})
})

describe('createSession', () => {
	it('returns a 256-bit token and stores only its hash', async () => {
		const { token } = await createSession(USER_ID)

		const [id] = vi.mocked(sessionRepository.createSession).mock.calls[0]

		expect(Buffer.from(token, 'base64url')).toHaveLength(32)

		expect(id).toBe(hashToken(token))

		expect(id).not.toBe(token)
	})

	it('mints a new token every time', async () => {
		const first = await createSession(USER_ID)
		const second = await createSession(USER_ID)

		expect(first.token).not.toBe(second.token)
	})

	it('expires after the session lifetime and caps sessions per user', async () => {
		const before = Date.now()

		await createSession(USER_ID)

		const [, userId, expiresAt, options] = vi.mocked(sessionRepository.createSession).mock.calls[0]

		expect(userId).toBe(USER_ID)

		expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + SESSION_TTL_SECONDS * 1000)

		expect(options).toEqual({ replacing: undefined, limit: MAX_SESSIONS_PER_USER, twoStep: false })
	})

	it("replaces the browser's previous session by its hash", async () => {
		await createSession(USER_ID, { replacing: 'old-token' })

		const [, , , options] = vi.mocked(sessionRepository.createSession).mock.calls[0]

		expect(options.replacing).toBe(hashToken('old-token'))
	})

	it('starts a session past its second step when the sign-in passed one', async () => {
		await createSession(USER_ID, { twoStep: true })

		const [, , , options] = vi.mocked(sessionRepository.createSession).mock.calls[0]

		expect(options.twoStep).toBe(true)
	})

	it('returns the session the repository created', async () => {
		expect((await createSession(USER_ID)).session).toBe(session)
	})
})

describe('findSession', () => {
	it('looks the session up by the hash of the token', async () => {
		await findSession('token')

		expect(sessionRepository.findSession).toHaveBeenCalledWith(hashToken('token'))
	})
})

describe('deleteUserSessions', () => {
	it('keeps the session it is told to keep', async () => {
		await deleteUserSessions(USER_ID, 'current')

		expect(sessionRepository.deleteUserSessions).toHaveBeenCalledWith(USER_ID, {
			except: 'current',
		})
	})
})
