import { resolve } from 'node:path'
import { resolveEnvironments, writeEnvFiles } from './environments.js'
import { loadManifests } from './manifests.js'
import { generateSecrets, loadSecretsCache, saveSecretsCache } from './secrets.js'

export interface InitOptions {
	/** Monorepo root directory. */
	rootDir: string
	/** Rotate secrets. `true` rotates all, string array rotates specific keys. */
	rotate?: true | string[]
	/** NODE_ENV value. Defaults to process.env.NODE_ENV or 'development'. */
	nodeEnv?: string
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

	writeEnvFiles(environments, servicesDir)

	saveSecretsCache(updatedCache, secretsCachePath)

	console.log('saved secrets cache')
}
