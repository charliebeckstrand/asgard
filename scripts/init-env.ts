import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface VarConfig {
	type: 'value' | 'secret' | 'ref'
	default?: string
	service?: string
	key?: string
}

interface Manifest {
	name: string
	port: number
	vars: Record<string, VarConfig>
}

type Manifests = Record<string, Manifest>

const scriptDir = dirname(fileURLToPath(import.meta.url))

const rootDir = resolve(scriptDir, '..')
const serviceDirs = [resolve(rootDir, 'apps'), resolve(rootDir, 'services')]
const secretsPath = resolve(rootDir, '.secrets.json')

// --- Parse CLI args ---

const args = process.argv.slice(2)

const rotateFlag = args.find((a) => a.startsWith('--rotate'))
const servicesFlag = args.find((a) => a.startsWith('--services='))

let rotate: true | string[] | undefined

if (rotateFlag) {
	const match = rotateFlag.match(/^--rotate=(.+)$/)

	rotate = match ? match[1].split(',') : true
}

const filterServices = servicesFlag?.match(/^--services=(.+)$/)?.[1].split(',')

// --- Load manifests ---

const manifests: Manifests = {}
const manifestPaths: Record<string, string> = {}

for (const servicesDir of serviceDirs) {
	if (!existsSync(servicesDir)) continue

	for (const entry of readdirSync(servicesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue

		const entryDir = resolve(servicesDir, entry.name)

		try {
			const manifest: Manifest = JSON.parse(
				readFileSync(resolve(entryDir, 'manifest.json'), 'utf-8'),
			)

			const name = manifest.name || entry.name

			manifests[name] = manifest
			manifestPaths[name] = entryDir
		} catch {
			// Skip missing or malformed manifests
		}
	}
}

if (Object.keys(manifests).length === 0) {
	console.error('No service manifests found.')

	process.exit(1)
}

// --- Load or initialize secrets cache ---

let cache: Record<string, string> = {}

try {
	cache = JSON.parse(readFileSync(secretsPath, 'utf-8'))
} catch {
	// First run — start fresh
}

// --- Generate secrets ---

let secrets: Record<string, string>

if (rotate === true) {
	console.log('rotating all secrets')

	secrets = {}
} else {
	secrets = { ...cache }
}

if (Array.isArray(rotate)) {
	for (const keyName of rotate) {
		for (const cacheKey of Object.keys(secrets)) {
			if (cacheKey.endsWith(`:${keyName}`)) {
				delete secrets[cacheKey]

				console.log(`rotating ${cacheKey}`)
			}
		}
	}
}

for (const [serviceName, manifest] of Object.entries(manifests)) {
	for (const [varName, config] of Object.entries(manifest.vars || {})) {
		if (config.type !== 'secret') continue

		const cacheKey = `${serviceName}:${varName}`

		if (!secrets[cacheKey]) {
			secrets[cacheKey] = randomBytes(32).toString('hex')

			console.log(`generated ${cacheKey}`)
		}
	}
}

// --- Resolve environments ---

const environments: Record<string, Record<string, string>> = {}

for (const [serviceName, manifest] of Object.entries(manifests)) {
	const resolved: Record<string, string> = {
		NODE_ENV: process.env.NODE_ENV ?? 'development',
		PORT: String(manifest.port),
	}

	for (const [varName, config] of Object.entries(manifest.vars || {})) {
		if (config.type === 'value') {
			resolved[varName] = config.default ?? ''
		} else if (config.type === 'secret') {
			resolved[varName] = secrets[`${serviceName}:${varName}`] ?? ''
		} else if (config.type === 'ref') {
			const refManifest = manifests[config.service ?? '']

			if (!refManifest) {
				console.error(
					`warning: ${serviceName}.${varName} references unknown service '${config.service}'`,
				)

				resolved[varName] = ''
			} else if (!config.key) {
				resolved[varName] = `http://localhost:${refManifest.port}`
			} else {
				const refVar = refManifest.vars?.[config.key]

				if (!refVar) {
					console.error(
						`warning: ${serviceName}.${varName} references '${config.service}.${config.key}' which does not exist`,
					)

					resolved[varName] = ''
				} else if (refVar.type === 'secret') {
					resolved[varName] = secrets[`${config.service}:${config.key}`] || ''
				} else if (refVar.type === 'value') {
					resolved[varName] = refVar.default ?? ''
				} else {
					console.error(
						`warning: ${serviceName}.${varName} references '${config.service}.${config.key}' which is itself a ref`,
					)

					resolved[varName] = ''
				}
			}
		}
	}

	environments[serviceName] = resolved
}

// --- Write .env files ---

for (const [serviceName, vars] of Object.entries(environments)) {
	if (filterServices && !filterServices.includes(serviceName)) continue

	const serviceDir = manifestPaths[serviceName]

	if (!serviceDir || !existsSync(serviceDir)) continue

	const content = Object.entries(vars)
		.map(([key, value]) => `${key}=${value}`)
		.join('\n')

	writeFileSync(resolve(serviceDir, '.env'), `${content}\n`)

	console.log(`wrote ${serviceName}/.env`)
}

// --- Save secrets cache ---

writeFileSync(secretsPath, `${JSON.stringify(secrets, null, '\t')}\n`)

console.log('saved secrets cache')
