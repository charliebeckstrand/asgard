import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ManifestData, ServiceManifest } from './types.js'

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
			const manifest: ServiceManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

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
