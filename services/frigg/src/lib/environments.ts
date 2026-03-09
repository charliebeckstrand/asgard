import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv } from './env.js'
import { loadManifests } from './manifests.js'

export type EnvironmentData = Record<string, Record<string, string>>

let cached: EnvironmentData | null = null

function getSecretsPath(): string {
	return resolve(import.meta.dirname, '..', '..', '..', '..', '.secrets.json')
}

function loadSecretsCache(): Record<string, string> {
	const secretsPath = getSecretsPath()

	if (!existsSync(secretsPath)) return {}

	try {
		return JSON.parse(readFileSync(secretsPath, 'utf-8'))
	} catch {
		return {}
	}
}

/**
 * Resolves all service configurations from manifests and secrets cache.
 * Returns a map of service name -> resolved environment variables.
 */
export function loadEnvironments(): EnvironmentData {
	if (cached) return cached

	const env = loadEnv()
	const manifests = loadManifests()
	const secretsCache = loadSecretsCache()

	const result: EnvironmentData = {}

	for (const [serviceName, manifest] of Object.entries(manifests)) {
		const resolved: Record<string, string> = {
			NODE_ENV: env.NODE_ENV,
			PORT: String(manifest.port),
		}

		for (const [varName, config] of Object.entries(manifest.vars)) {
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
						resolved[varName] = ''

						break
					}

					if (config.key) {
						const refVarConfig = refManifest.vars[config.key]

						if (refVarConfig?.type === 'secret') {
							const cacheKey = `${config.service}:${config.key}`

							resolved[varName] = secretsCache[cacheKey] ?? ''
						} else if (refVarConfig?.type === 'value') {
							resolved[varName] = refVarConfig.default ?? ''
						} else {
							resolved[varName] = ''
						}
					} else {
						resolved[varName] = `http://localhost:${refManifest.port}`
					}
					break
				}
			}
		}

		result[serviceName] = resolved
	}

	cached = result

	return cached
}

export function getServiceConfig(service: string): Record<string, string> | null {
	const environments = loadEnvironments()

	return environments[service] ?? null
}

export function getServiceNames(): string[] {
	const environments = loadEnvironments()

	return Object.keys(environments)
}

export function clearCache(): void {
	cached = null
}
