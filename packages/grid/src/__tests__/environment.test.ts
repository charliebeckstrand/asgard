import { z } from 'zod'
import { createEnvironment, getManifestPort } from '../environment.js'

describe('getManifestPort', () => {
	it('throws when manifest.json is not found', () => {
		const original = process.cwd

		process.cwd = () => '/'

		expect(() => getManifestPort()).toThrow('manifest.json not found')

		process.cwd = original
	})
})

describe('createEnvironment', () => {
	it('returns parsed env with defaults', () => {
		vi.stubEnv('PORT', '4000')
		vi.stubEnv('NODE_ENV', 'test')

		const environment = createEnvironment()

		const env = environment()

		expect(env.PORT).toBe(4000)
		expect(env.NODE_ENV).toBe('test')
	})

	it('defaults NODE_ENV to development', () => {
		vi.stubEnv('PORT', '4000')

		delete process.env.NODE_ENV

		const env = createEnvironment()

		expect(env().NODE_ENV).toBe('development')
	})

	it('caches result on subsequent calls', () => {
		vi.stubEnv('PORT', '4000')
		vi.stubEnv('NODE_ENV', 'test')

		const environment = createEnvironment()

		const first = environment()
		const second = environment()

		expect(first).toBe(second)
	})

	it('extends with extra Zod schema fields', () => {
		vi.stubEnv('PORT', '4000')
		vi.stubEnv('NODE_ENV', 'test')
		vi.stubEnv('DATABASE_URL', 'postgres://localhost/test')

		const environment = createEnvironment({ DATABASE_URL: z.string() })

		const env = environment()

		expect(env.DATABASE_URL).toBe('postgres://localhost/test')
		expect(env.PORT).toBe(4000)
	})

	it('treats empty strings as undefined for optional fields', () => {
		vi.stubEnv('PORT', '4000')
		vi.stubEnv('NODE_ENV', 'test')
		vi.stubEnv('OPTIONAL_VAR', '')

		const env = createEnvironment({
			OPTIONAL_VAR: z.string().optional(),
		})

		const result = env()

		expect(result.OPTIONAL_VAR).toBeUndefined()
	})

	it('filters empty string env vars', () => {
		vi.stubEnv('PORT', '4000')
		vi.stubEnv('NODE_ENV', '')

		const environment = createEnvironment()

		const env = environment()

		expect(env.NODE_ENV).toBe('development')
	})

	it('calls process.exit on invalid env', () => {
		vi.stubEnv('PORT', 'not-a-number')
		vi.stubEnv('NODE_ENV', 'invalid')

		const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

		const environment = createEnvironment()

		environment()

		expect(mockExit).toHaveBeenCalledWith(1)

		mockExit.mockRestore()
	})
})
