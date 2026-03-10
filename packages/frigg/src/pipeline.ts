import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VarConfig {
	type: 'value' | 'secret' | 'ref'
	default?: string
	service?: string
	key?: string
}

export interface Manifest {
	name: string
	port: number
	vars: Record<string, VarConfig>
}

export type EnvironmentData = Record<string, Record<string, string>>

export type ManifestData = Record<string, Manifest>

export interface Issue {
	level: 'error' | 'warning'
	message: string
}

// ---------------------------------------------------------------------------
// Manifests
// ---------------------------------------------------------------------------

/**
 * Load all service manifests from a services directory.
 */
export function loadManifests(servicesDir: string): ManifestData {
	const manifests: ManifestData = {}

	for (const entry of readdirSync(servicesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue

		const manifestPath = resolve(servicesDir, entry.name, 'manifest.json')

		if (!existsSync(manifestPath)) continue

		try {
			const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

			manifests[manifest.name || entry.name] = manifest
		} catch {
			// Skip malformed manifests
		}
	}

	return manifests
}

/**
 * Build a map of secret consumers: which services use each secret.
 */
export function getSecretConsumers(manifests: ManifestData): Record<string, string[]> {
	const consumers: Record<string, string[]> = {}

	for (const [serviceName, manifest] of Object.entries(manifests)) {
		for (const [varName, config] of Object.entries(manifest.vars)) {
			if (config.type === 'secret') {
				const list = consumers[varName] ?? []

				list.push(serviceName)

				consumers[varName] = list
			} else if (config.type === 'ref' && config.key) {
				const list = consumers[config.key] ?? []

				list.push(serviceName)

				consumers[config.key] = list
			}
		}
	}

	return consumers
}

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

export interface GenerateSecretsOptions {
	/** Rotate secrets. `true` rotates all, string array rotates specific keys. */
	rotate?: true | string[]
}

/**
 * Generate secrets for all services. Returns an updated secrets cache.
 * Existing secrets are preserved unless rotation is requested.
 */
export function generateSecrets(
	manifests: ManifestData,
	cache: Record<string, string>,
	options?: GenerateSecretsOptions,
): Record<string, string> {
	const updated = { ...cache }

	// Handle rotation: remove specified keys
	if (options?.rotate) {
		if (options.rotate === true) {
			for (const key of Object.keys(updated)) {
				delete updated[key]
			}

			console.log('  rotating all secrets')
		} else {
			for (const keyName of options.rotate) {
				for (const cacheKey of Object.keys(updated)) {
					if (cacheKey.endsWith(`:${keyName}`)) {
						delete updated[cacheKey]

						console.log(`  rotating ${cacheKey}`)
					}
				}
			}
		}
	}

	// Generate secrets for vars with type 'secret'
	for (const [serviceName, manifest] of Object.entries(manifests)) {
		for (const [varName, config] of Object.entries(manifest.vars || {})) {
			if (config.type !== 'secret') continue

			const cacheKey = `${serviceName}:${varName}`

			if (!updated[cacheKey]) {
				updated[cacheKey] = randomBytes(32).toString('hex')

				console.log(`  generated ${cacheKey}`)
			}
		}
	}

	return updated
}

/**
 * Load secrets cache from a JSON file.
 */
export function loadSecretsCache(path: string): Record<string, string> {
	if (!existsSync(path)) return {}

	try {
		return JSON.parse(readFileSync(path, 'utf-8'))
	} catch {
		return {}
	}
}

/**
 * Save secrets cache to a JSON file.
 */
export function saveSecretsCache(cache: Record<string, string>, path: string): void {
	writeFileSync(path, `${JSON.stringify(cache, null, '\t')}\n`)
}

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

/**
 * Resolve all service configurations from manifests and a secrets cache.
 * Returns a map of service name -> resolved environment variables.
 */
export function resolveEnvironments(
	manifests: ManifestData,
	secretsCache: Record<string, string>,
	nodeEnv = 'development',
): EnvironmentData {
	const result: EnvironmentData = {}

	for (const [serviceName, manifest] of Object.entries(manifests)) {
		const resolved: Record<string, string> = {
			NODE_ENV: nodeEnv,
			PORT: String(manifest.port),
		}

		for (const [varName, config] of Object.entries(manifest.vars || {})) {
			switch (config.type) {
				case 'value': {
					resolved[varName] = config.default ?? ''

					break
				}

				case 'secret': {
					const cacheKey = `${serviceName}:${varName}`

					resolved[varName] = secretsCache[cacheKey] ?? ''

					break
				}

				case 'ref': {
					const refManifest = manifests[config.service ?? '']

					if (!refManifest) {
						console.error(
							`  warning: ${serviceName}.${varName} references unknown service '${config.service}'`,
						)

						resolved[varName] = ''

						break
					}

					if (config.key) {
						const refVarConfig = refManifest.vars?.[config.key]

						if (!refVarConfig) {
							console.error(
								`  warning: ${serviceName}.${varName} references '${config.service}.${config.key}' which does not exist`,
							)

							resolved[varName] = ''
						} else if (refVarConfig.type === 'secret') {
							const cacheKey = `${config.service}:${config.key}`

							resolved[varName] = secretsCache[cacheKey] || ''
						} else if (refVarConfig.type === 'value') {
							resolved[varName] = refVarConfig.default ?? ''
						} else {
							console.error(
								`  warning: ${serviceName}.${varName} references '${config.service}.${config.key}' which is itself a ref (not supported)`,
							)

							resolved[varName] = ''
						}
					} else {
						resolved[varName] = `http://localhost:${refManifest.port}`
					}

					break
				}

				default:
					console.error(
						`  warning: ${serviceName}.${varName} has unknown type '${(config as { type: string }).type}'`,
					)

					resolved[varName] = ''
			}
		}

		result[serviceName] = resolved
	}

	return result
}

/**
 * Write .env files for each service into their respective directories.
 * When `filter` is provided, only writes .env files for the specified services.
 */
export function writeEnvFiles(
	environments: EnvironmentData,
	servicesDir: string,
	filter?: string[],
): void {
	for (const [serviceName, vars] of Object.entries(environments)) {
		if (filter && !filter.includes(serviceName)) continue

		const serviceDir = resolve(servicesDir, serviceName)

		if (!existsSync(serviceDir)) continue

		const content = Object.entries(vars)
			.map(([key, value]) => `${key}=${value}`)
			.join('\n')

		writeFileSync(resolve(serviceDir, '.env'), `${content}\n`)

		console.log(`  wrote ${serviceName}/.env`)
	}
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function getStatus(issues: Issue[]): 'pass' | 'warn' | 'fail' {
	if (issues.some((i) => i.level === 'error')) return 'fail'
	if (issues.some((i) => i.level === 'warning')) return 'warn'

	return 'pass'
}

/**
 * Check for port conflicts across all services.
 */
export function checkPortConflicts(
	allServices: EnvironmentData,
): { service: string; issues: Issue[] }[] {
	const portMap = new Map<string, string[]>()

	for (const [name, data] of Object.entries(allServices)) {
		if (!data.PORT) continue

		const existing = portMap.get(data.PORT) ?? []

		existing.push(name)

		portMap.set(data.PORT, existing)
	}

	const results: { service: string; issues: Issue[] }[] = []

	for (const [port, services] of portMap) {
		if (services.length <= 1) continue

		for (const service of services) {
			results.push({
				service,
				issues: [
					{
						level: 'error',
						message: `PORT ${port} conflicts with: ${services.filter((s) => s !== service).join(', ')}`,
					},
				],
			})
		}
	}

	return results
}

/**
 * Validate a single service's resolved environment.
 */
export function validateService(
	name: string,
	data: Record<string, string>,
	allServices: EnvironmentData,
	manifests: ManifestData,
): Issue[] {
	const issues: Issue[] = []

	// Check for empty values
	for (const [key, value] of Object.entries(data)) {
		if (value === '') {
			issues.push({ level: 'error', message: `${key} is empty` })
		}
	}

	// Validate PORT is a number
	if (data.PORT !== undefined) {
		const port = Number(data.PORT)

		if (Number.isNaN(port) || port < 1 || port > 65535) {
			issues.push({ level: 'error', message: `PORT '${data.PORT}' is not a valid port number` })
		}
	} else {
		issues.push({ level: 'warning', message: 'No PORT configured' })
	}

	// Validate URL-shaped keys
	for (const [key, value] of Object.entries(data)) {
		if (!key.endsWith('_URL')) continue

		try {
			new URL(value)
		} catch {
			issues.push({ level: 'error', message: `${key} '${value}' is not a valid URL` })
		}
	}

	// Check cross-service references
	for (const [key, value] of Object.entries(data)) {
		if (!key.endsWith('_URL')) continue

		const refName = key.replace(/_URL$/, '').toLowerCase()

		const refService = allServices[refName]

		if (!refService) continue

		try {
			const url = new URL(value)

			const urlPort = url.port || (url.protocol === 'https:' ? '443' : '80')

			if (refService.PORT && urlPort !== refService.PORT) {
				issues.push({
					level: 'error',
					message: `${key} port :${urlPort} does not match ${refName}'s PORT ${refService.PORT}`,
				})
			}
		} catch {
			// Already reported as invalid URL above
		}
	}

	// Check API key consistency
	for (const [key, value] of Object.entries(data)) {
		if (!key.endsWith('_API_KEY')) continue

		const refName = key.replace(/_API_KEY$/, '').toLowerCase()

		const refService = allServices[refName]

		if (!refService) continue

		const refKey = `${key.replace(/_API_KEY$/, '').toUpperCase()}_API_KEY`

		if (refService[refKey] && refService[refKey] !== value) {
			issues.push({
				level: 'error',
				message: `${key} does not match ${refName}'s ${refKey}`,
			})
		}
	}

	// Manifest-aware checks
	const manifest = manifests[name]

	if (manifest) {
		for (const varName of Object.keys(manifest.vars)) {
			if (data[varName] === undefined) {
				issues.push({
					level: 'error',
					message: `${varName} declared in manifest but missing from config`,
				})
			}
		}

		for (const [varName, config] of Object.entries(manifest.vars)) {
			if (config.type !== 'ref' || !config.service) continue

			const refManifest = manifests[config.service]

			if (!refManifest) {
				issues.push({
					level: 'error',
					message: `${varName} references service '${config.service}' which has no manifest`,
				})

				continue
			}

			if (config.key && !refManifest.vars[config.key]) {
				issues.push({
					level: 'error',
					message: `${varName} references '${config.service}.${config.key}' which is not declared in ${config.service}'s manifest`,
				})
			}
		}
	} else {
		issues.push({ level: 'warning', message: 'No manifest.json found for this service' })
	}

	return issues
}

/**
 * Validate all services, including port conflict checks.
 */
export function validateAll(
	environments: EnvironmentData,
	manifests: ManifestData,
): { service: string; status: 'pass' | 'warn' | 'fail'; issues: Issue[] }[] {
	const portConflicts = checkPortConflicts(environments)

	return Object.entries(environments).map(([name, data]) => {
		const issues = validateService(name, data, environments, manifests)

		const conflicts = portConflicts.find((pc) => pc.service === name)

		if (conflicts) {
			issues.push(...conflicts.issues)
		}

		return { service: name, status: getStatus(issues), issues }
	})
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export interface InitOptions {
	/** Monorepo root directory. */
	rootDir: string
	/** Rotate secrets. `true` rotates all, string array rotates specific keys. */
	rotate?: true | string[]
	/** NODE_ENV value. Defaults to process.env.NODE_ENV or 'development'. */
	nodeEnv?: string
	/** Only write .env files for these services. All manifests are still loaded for cross-references. */
	services?: string[]
}

/**
 * Full pipeline: load manifests, generate secrets, resolve environments, write .env files.
 */
export function initEnvironments(options: InitOptions): void {
	const servicesDir = resolve(options.rootDir, 'services')
	const secretsCachePath = resolve(options.rootDir, '.secrets.json')

	const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development'

	const manifests = loadManifests(servicesDir)

	if (Object.keys(manifests).length === 0) {
		console.error('No service manifests found.')
		process.exit(1)
	}

	const cache = loadSecretsCache(secretsCachePath)

	const updatedCache = generateSecrets(manifests, cache, {
		rotate: options.rotate,
	})

	const environments = resolveEnvironments(manifests, updatedCache, nodeEnv)

	writeEnvFiles(environments, servicesDir, options.services)

	saveSecretsCache(updatedCache, secretsCachePath)

	console.log('saved secrets cache')
}
