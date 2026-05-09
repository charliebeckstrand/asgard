import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
	type DiscoveredManifest,
	discoverManifests,
	findWorkspaceRoot,
	type Manifest,
} from './manifest.js'

export interface SyncEnvOptions {
	/** Restrict writes to this set of service names. */
	services?: string[]
	/**
	 * `true` regenerates every secret. A `string[]` regenerates only secrets whose
	 * variable name appears in the list (across all services).
	 */
	rotate?: true | string[]
	/** Defaults to the workspace root inferred from the current working directory. */
	workspaceRoot?: string
}

export interface SyncEnvResult {
	written: string[]
	generated: string[]
	rotated: string[]
}

const SECRET_BYTES = 32

function loadSecrets(path: string): Record<string, string> {
	try {
		return JSON.parse(readFileSync(path, 'utf-8'))
	} catch {
		return {}
	}
}

function resolveVars(
	serviceName: string,
	manifest: Manifest,
	manifests: Map<string, DiscoveredManifest>,
	secrets: Record<string, string>,
): Record<string, string> {
	const resolved: Record<string, string> = {
		NODE_ENV: process.env.NODE_ENV ?? 'development',
		PORT: String(manifest.port),
	}

	for (const [varName, config] of Object.entries(manifest.vars ?? {})) {
		if (config.type === 'value') {
			resolved[varName] = config.default ?? ''

			continue
		}

		if (config.type === 'secret') {
			resolved[varName] = secrets[`${serviceName}:${varName}`] ?? ''

			continue
		}

		const ref = manifests.get(config.service)

		if (!ref) {
			console.warn(
				`warning: ${serviceName}.${varName} references unknown service '${config.service}'`,
			)

			resolved[varName] = ''

			continue
		}

		if (!config.key) {
			resolved[varName] = `http://localhost:${ref.manifest.port}`

			continue
		}

		const refVar = ref.manifest.vars?.[config.key]

		if (!refVar) {
			console.warn(
				`warning: ${serviceName}.${varName} references '${config.service}.${config.key}' which does not exist`,
			)

			resolved[varName] = ''
		} else if (refVar.type === 'secret') {
			resolved[varName] = secrets[`${config.service}:${config.key}`] ?? ''
		} else if (refVar.type === 'value') {
			resolved[varName] = refVar.default ?? ''
		} else {
			console.warn(
				`warning: ${serviceName}.${varName} references '${config.service}.${config.key}' which is itself a ref`,
			)

			resolved[varName] = ''
		}
	}

	return resolved
}

export function syncEnv(options: SyncEnvOptions = {}): SyncEnvResult {
	const workspaceRoot = options.workspaceRoot ?? findWorkspaceRoot()

	const secretsPath = resolve(workspaceRoot, '.secrets.json')

	const manifests = discoverManifests(workspaceRoot)

	if (manifests.size === 0) {
		throw new Error(`No service manifests found under ${workspaceRoot}`)
	}

	const cache = loadSecrets(secretsPath)

	const secrets: Record<string, string> = options.rotate === true ? {} : { ...cache }

	const rotated: string[] = []

	if (Array.isArray(options.rotate)) {
		for (const varName of options.rotate) {
			for (const cacheKey of Object.keys(secrets)) {
				if (cacheKey.endsWith(`:${varName}`)) {
					delete secrets[cacheKey]

					rotated.push(cacheKey)
				}
			}
		}
	} else if (options.rotate === true) {
		rotated.push(...Object.keys(cache))
	}

	const generated: string[] = []

	for (const [serviceName, { manifest }] of manifests) {
		for (const [varName, config] of Object.entries(manifest.vars ?? {})) {
			if (config.type !== 'secret') continue

			const cacheKey = `${serviceName}:${varName}`

			if (!secrets[cacheKey]) {
				secrets[cacheKey] = randomBytes(SECRET_BYTES).toString('hex')

				generated.push(cacheKey)
			}
		}
	}

	const filter = options.services ? new Set(options.services) : null

	const written: string[] = []

	for (const [serviceName, { manifest, dir }] of manifests) {
		if (filter && !filter.has(serviceName)) continue

		const vars = resolveVars(serviceName, manifest, manifests, secrets)

		const content = Object.entries(vars)
			.map(([key, value]) => `${key}=${value}`)
			.join('\n')

		writeFileSync(resolve(dir, '.env'), `${content}\n`)

		written.push(serviceName)
	}

	writeFileSync(secretsPath, `${JSON.stringify(secrets, null, '\t')}\n`)

	return { written, generated, rotated }
}
