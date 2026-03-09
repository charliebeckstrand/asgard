import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const servicesDir = resolve(root, 'services')
const environmentsDir = resolve(root, 'environments')
const secretsCachePath = resolve(environmentsDir, '.secrets.json')
const overridesPath = resolve(environmentsDir, 'overrides.json')

// --- Parse CLI flags ---

const args = process.argv.slice(2)
const rotateFlag = args.find((a) => a.startsWith('--rotate'))
let rotateKeys = null // null = no rotation, [] = rotate all, ['KEY'] = rotate specific

if (rotateFlag) {
	const match = rotateFlag.match(/^--rotate=(.+)$/)
	rotateKeys = match ? match[1].split(',') : []
}

// --- Load manifests ---

function loadManifests() {
	const manifests = {}

	for (const entry of readdirSync(servicesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue

		const manifestPath = resolve(servicesDir, entry.name, 'manifest.json')

		if (!existsSync(manifestPath)) continue

		try {
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
			manifests[manifest.name || entry.name] = manifest
		} catch (err) {
			console.error(`  error: could not parse ${entry.name}/manifest.json: ${err.message}`)
		}
	}

	return manifests
}

// --- Load secrets cache ---

function loadSecretsCache() {
	if (!existsSync(secretsCachePath)) return {}

	try {
		return JSON.parse(readFileSync(secretsCachePath, 'utf-8'))
	} catch {
		return {}
	}
}

// --- Load overrides ---

function loadOverrides() {
	if (!existsSync(overridesPath)) return {}

	try {
		return JSON.parse(readFileSync(overridesPath, 'utf-8'))
	} catch {
		return {}
	}
}

// --- Generate a secret ---

function generateSecret(length = 32) {
	return randomBytes(length).toString('hex')
}

// --- Main ---

const manifests = loadManifests()
const secretsCache = loadSecretsCache()
const overrides = loadOverrides()

if (Object.keys(manifests).length === 0) {
	console.error('No service manifests found.')
	process.exit(1)
}

// Handle rotation: remove specified keys from cache
if (rotateKeys !== null) {
	if (rotateKeys.length === 0) {
		// Rotate all
		for (const key of Object.keys(secretsCache)) {
			delete secretsCache[key]
		}
		console.log('  rotating all secrets')
	} else {
		// Rotate specific keys
		for (const keyName of rotateKeys) {
			for (const cacheKey of Object.keys(secretsCache)) {
				if (cacheKey.endsWith(`:${keyName}`)) {
					delete secretsCache[cacheKey]
					console.log(`  rotating ${cacheKey}`)
				}
			}
		}
	}
}

// Phase 1: Generate all owned secrets
for (const [serviceName, manifest] of Object.entries(manifests)) {
	for (const [varName, config] of Object.entries(manifest.vars || {})) {
		if (config.type !== 'secret') continue

		const cacheKey = `${serviceName}:${varName}`

		if (!secretsCache[cacheKey]) {
			secretsCache[cacheKey] = generateSecret()
			console.log(`  generated ${cacheKey}`)
		}
	}
}

// Phase 2: Resolve all vars for each service and write .env files
const nodeEnv = process.env.NODE_ENV || 'development'

for (const [serviceName, manifest] of Object.entries(manifests)) {
	const serviceDir = resolve(servicesDir, serviceName)

	if (!existsSync(serviceDir)) continue

	const resolved = {
		NODE_ENV: nodeEnv,
		PORT: String(manifest.port),
	}

	const serviceOverrides = overrides[serviceName] || {}

	for (const [varName, config] of Object.entries(manifest.vars || {})) {
		// Overrides take priority over everything
		if (serviceOverrides[varName] !== undefined) {
			resolved[varName] = serviceOverrides[varName]
			continue
		}

		switch (config.type) {
			case 'value': {
				resolved[varName] = config.default ?? ''
				break
			}

			case 'secret': {
				const cacheKey = `${serviceName}:${varName}`
				resolved[varName] = secretsCache[cacheKey]
				break
			}

			case 'ref': {
				const refManifest = manifests[config.service]

				if (!refManifest) {
					console.error(
						`  warning: ${serviceName}.${varName} references unknown service '${config.service}'`,
					)
					resolved[varName] = ''
					break
				}

				if (config.key) {
					// Reference a specific key from the target service
					const refVarConfig = refManifest.vars?.[config.key]

					if (!refVarConfig) {
						console.error(
							`  warning: ${serviceName}.${varName} references '${config.service}.${config.key}' which does not exist`,
						)
						resolved[varName] = ''
					} else if (refVarConfig.type === 'secret') {
						// Pull the secret from the owner
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
					// Auto-derive URL from port
					resolved[varName] = `http://localhost:${refManifest.port}`
				}
				break
			}

			default:
				console.error(`  warning: ${serviceName}.${varName} has unknown type '${config.type}'`)
				resolved[varName] = ''
		}
	}

	const content = Object.entries(resolved)
		.map(([key, value]) => `${key}=${value}`)
		.join('\n')

	writeFileSync(resolve(serviceDir, '.env'), `${content}\n`)
	console.log(`  wrote ${serviceName}/.env`)
}

// Phase 3: Save secrets cache
writeFileSync(secretsCachePath, JSON.stringify(secretsCache, null, '\t') + '\n')
console.log('  saved secrets cache')
