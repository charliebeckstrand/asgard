import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EnvironmentData, ManifestData } from '../pipeline.js'
import {
	checkPortConflicts,
	generateSecrets,
	resolveEnvironments,
	validateAll,
	validateService,
	writeEnvFiles,
} from '../pipeline.js'

const manifests: ManifestData = {
	heimdall: {
		name: 'heimdall',
		port: 3001,
		vars: {
			SECRET_KEY: { type: 'secret' },
			HEIMDALL_API_KEY: { type: 'secret' },
			DATABASE_URL: { type: 'value', default: 'postgresql://localhost/heimdall' },
		},
	},
	bifrost: {
		name: 'bifrost',
		port: 3000,
		vars: {
			SESSION_SECRET: { type: 'secret' },
			HEIMDALL_URL: { type: 'ref', service: 'heimdall' },
			HEIMDALL_API_KEY: { type: 'ref', service: 'heimdall', key: 'HEIMDALL_API_KEY' },
		},
	},
}

const secretsCache: Record<string, string> = {
	'heimdall:SECRET_KEY': 'secret-key-value',
	'heimdall:HEIMDALL_API_KEY': 'api-key-value',
	'bifrost:SESSION_SECRET': 'session-secret-value',
}

describe('resolveEnvironments', () => {
	it('resolves NODE_ENV and PORT for each service', () => {
		const result = resolveEnvironments(manifests, secretsCache, 'production')

		expect(result.heimdall.NODE_ENV).toBe('production')
		expect(result.heimdall.PORT).toBe('3001')

		expect(result.bifrost.NODE_ENV).toBe('production')
		expect(result.bifrost.PORT).toBe('3000')
	})

	it('resolves value type vars with defaults', () => {
		const result = resolveEnvironments(manifests, secretsCache)

		expect(result.heimdall.DATABASE_URL).toBe('postgresql://localhost/heimdall')
	})

	it('resolves secret type vars from cache', () => {
		const result = resolveEnvironments(manifests, secretsCache)

		expect(result.heimdall.SECRET_KEY).toBe('secret-key-value')
		expect(result.heimdall.HEIMDALL_API_KEY).toBe('api-key-value')
	})

	it('resolves ref type vars without key as URL from port', () => {
		const result = resolveEnvironments(manifests, secretsCache)

		expect(result.bifrost.HEIMDALL_URL).toBe('http://localhost:3001')
	})

	it('resolves ref type vars with key from referenced service secret', () => {
		const result = resolveEnvironments(manifests, secretsCache)

		expect(result.bifrost.HEIMDALL_API_KEY).toBe('api-key-value')
	})

	it('defaults NODE_ENV to development', () => {
		const result = resolveEnvironments(manifests, secretsCache)

		expect(result.heimdall.NODE_ENV).toBe('development')
	})

	it('returns empty string for missing secrets', () => {
		const result = resolveEnvironments(manifests, {})

		expect(result.heimdall.SECRET_KEY).toBe('')
	})

	it('returns empty string for ref to unknown service', () => {
		const manifests: ManifestData = {
			test: {
				name: 'test',
				port: 3000,
				vars: {
					UNKNOWN_URL: { type: 'ref', service: 'nonexistent' },
				},
			},
		}

		const result = resolveEnvironments(manifests, {})

		expect(result.test.UNKNOWN_URL).toBe('')
	})
})

describe('writeEnvFiles', () => {
	let servicesDir: string

	beforeEach(() => {
		servicesDir = join(tmpdir(), `frigg-test-${Date.now()}`)

		mkdirSync(join(servicesDir, 'heimdall'), { recursive: true })
		mkdirSync(join(servicesDir, 'bifrost'), { recursive: true })
	})

	afterEach(() => {
		rmSync(servicesDir, { recursive: true, force: true })
	})

	it('writes .env files for all services when no filter is provided', () => {
		const environments = resolveEnvironments(manifests, secretsCache)

		writeEnvFiles(environments, servicesDir)

		expect(existsSync(join(servicesDir, 'heimdall', '.env'))).toBe(true)

		expect(existsSync(join(servicesDir, 'bifrost', '.env'))).toBe(true)
	})

	it('writes .env only for filtered services', () => {
		const environments = resolveEnvironments(manifests, secretsCache)

		writeEnvFiles(environments, servicesDir, ['bifrost'])

		expect(existsSync(join(servicesDir, 'bifrost', '.env'))).toBe(true)

		expect(existsSync(join(servicesDir, 'heimdall', '.env'))).toBe(false)
	})

	it('resolves cross-service refs even when only writing filtered service', () => {
		const environments = resolveEnvironments(manifests, secretsCache)

		writeEnvFiles(environments, servicesDir, ['bifrost'])

		const content = readFileSync(join(servicesDir, 'bifrost', '.env'), 'utf-8')

		expect(content).toContain('HEIMDALL_URL=http://localhost:3001')
		expect(content).toContain('HEIMDALL_API_KEY=api-key-value')
	})
})

describe('generateSecrets', () => {
	it('generates secrets for vars with type secret', () => {
		const result = generateSecrets(manifests, {})

		expect(result['heimdall:SECRET_KEY']).toBeDefined()
		expect(result['heimdall:SECRET_KEY']).toHaveLength(64) // 32 bytes hex

		expect(result['heimdall:HEIMDALL_API_KEY']).toBeDefined()

		expect(result['bifrost:SESSION_SECRET']).toBeDefined()
	})

	it('preserves existing secrets', () => {
		const existing = { 'heimdall:SECRET_KEY': 'existing-secret' }

		const result = generateSecrets(manifests, existing)

		expect(result['heimdall:SECRET_KEY']).toBe('existing-secret')

		expect(result['heimdall:HEIMDALL_API_KEY']).toBeDefined()
	})

	it('does not generate secrets for non-secret vars', () => {
		const result = generateSecrets(manifests, {})

		expect(result['heimdall:DATABASE_URL']).toBeUndefined()

		expect(result['bifrost:HEIMDALL_URL']).toBeUndefined()
	})

	it('rotates all secrets when rotate is true', () => {
		const existing = {
			'heimdall:SECRET_KEY': 'old-1',
			'heimdall:HEIMDALL_API_KEY': 'old-2',
			'bifrost:SESSION_SECRET': 'old-3',
		}

		const result = generateSecrets(manifests, existing, { rotate: true })

		expect(result['heimdall:SECRET_KEY']).not.toBe('old-1')
		expect(result['heimdall:HEIMDALL_API_KEY']).not.toBe('old-2')

		expect(result['bifrost:SESSION_SECRET']).not.toBe('old-3')
	})

	it('rotates specific secrets by key name', () => {
		const existing = {
			'heimdall:SECRET_KEY': 'old-1',
			'heimdall:HEIMDALL_API_KEY': 'old-2',
			'bifrost:SESSION_SECRET': 'old-3',
		}

		const result = generateSecrets(manifests, existing, { rotate: ['SECRET_KEY'] })

		expect(result['heimdall:SECRET_KEY']).not.toBe('old-1')
		expect(result['heimdall:HEIMDALL_API_KEY']).toBe('old-2')

		expect(result['bifrost:SESSION_SECRET']).toBe('old-3')
	})
})

const validateManifests: ManifestData = {
	heimdall: {
		name: 'heimdall',
		port: 3001,
		vars: {
			SECRET_KEY: { type: 'secret' },
			DATABASE_URL: { type: 'value', default: 'postgresql://localhost/heimdall' },
		},
	},
	bifrost: {
		name: 'bifrost',
		port: 3000,
		vars: {
			HEIMDALL_URL: { type: 'ref', service: 'heimdall' },
			HEIMDALL_API_KEY: { type: 'ref', service: 'heimdall', key: 'SECRET_KEY' },
		},
	},
}

describe('validateService', () => {
	it('reports empty values as errors', () => {
		const data = { PORT: '3001', SECRET_KEY: '', DATABASE_URL: 'pg://localhost/db' }

		const allServices: EnvironmentData = { heimdall: data }

		const issues = validateService('heimdall', data, allServices, validateManifests)

		expect(issues).toContainEqual({ level: 'error', message: 'SECRET_KEY is empty' })
	})

	it('reports invalid PORT', () => {
		const data = { PORT: 'abc' }

		const allServices: EnvironmentData = { test: data }

		const issues = validateService('test', data, allServices, {})

		expect(issues).toContainEqual({
			level: 'error',
			message: "PORT 'abc' is not a valid port number",
		})
	})

	it('reports invalid URLs', () => {
		const data = { PORT: '3000', HEIMDALL_URL: 'not-a-url' }

		const allServices: EnvironmentData = { bifrost: data }

		const issues = validateService('bifrost', data, allServices, validateManifests)

		expect(issues).toContainEqual({
			level: 'error',
			message: "HEIMDALL_URL 'not-a-url' is not a valid URL",
		})
	})

	it('reports missing manifest vars', () => {
		const data = { PORT: '3001', NODE_ENV: 'development' }

		const allServices: EnvironmentData = { heimdall: data }

		const issues = validateService('heimdall', data, allServices, validateManifests)

		expect(issues).toContainEqual({
			level: 'error',
			message: 'SECRET_KEY declared in manifest but missing from config',
		})
	})

	it('warns when no manifest found', () => {
		const data = { PORT: '3000' }

		const allServices: EnvironmentData = { unknown: data }

		const issues = validateService('unknown', data, allServices, {})

		expect(issues).toContainEqual({
			level: 'warning',
			message: 'No manifest.json found for this service',
		})
	})

	it('passes for valid configuration', () => {
		const data = {
			PORT: '3001',
			NODE_ENV: 'development',
			SECRET_KEY: 'abc123',
			DATABASE_URL: 'postgresql://localhost/heimdall',
		}

		const allServices: EnvironmentData = { heimdall: data }

		const issues = validateService('heimdall', data, allServices, validateManifests)

		expect(issues).toHaveLength(0)
	})
})

describe('checkPortConflicts', () => {
	it('detects port conflicts', () => {
		const allServices: EnvironmentData = {
			service1: { PORT: '3000' },
			service2: { PORT: '3000' },
			service3: { PORT: '3001' },
		}

		const conflicts = checkPortConflicts(allServices)

		expect(conflicts).toHaveLength(2) // both conflicting services get an issue
		expect(conflicts[0].issues[0].message).toContain('PORT 3000 conflicts with')
	})

	it('returns empty when no conflicts', () => {
		const allServices: EnvironmentData = {
			service1: { PORT: '3000' },
			service2: { PORT: '3001' },
		}

		expect(checkPortConflicts(allServices)).toHaveLength(0)
	})
})

describe('validateAll', () => {
	it('returns results for all services', () => {
		const environments: EnvironmentData = {
			heimdall: {
				PORT: '3001',
				NODE_ENV: 'development',
				SECRET_KEY: 'abc',
				DATABASE_URL: 'postgresql://localhost/heimdall',
			},
			bifrost: {
				PORT: '3000',
				NODE_ENV: 'development',
				HEIMDALL_URL: 'http://localhost:3001',
				HEIMDALL_API_KEY: 'abc',
			},
		}

		const results = validateAll(environments, validateManifests)

		expect(results).toHaveLength(2)

		for (const result of results) {
			expect(result.service).toBeDefined()
			expect(['pass', 'warn', 'fail']).toContain(result.status)
		}
	})
})
