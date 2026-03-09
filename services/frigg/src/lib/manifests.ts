import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface VarConfig {
	type: 'value' | 'secret' | 'ref'
	default?: string
	service?: string
	key?: string
}

export interface ServiceManifest {
	name: string
	port: number
	vars: Record<string, VarConfig>
}

export type ManifestData = Record<string, ServiceManifest>

let cached: ManifestData | null = null

function getServicesDir(): string {
	return resolve(import.meta.dirname, '..', '..', '..', '..')
}

export function loadManifests(): ManifestData {
	if (cached) return cached

	const servicesDir = resolve(getServicesDir(), 'services')
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

	cached = manifests
	return cached
}

export function getManifest(service: string): ServiceManifest | null {
	const manifests = loadManifests()
	return manifests[service] ?? null
}

export function getManifestNames(): string[] {
	return Object.keys(loadManifests())
}

export function clearManifestCache(): void {
	cached = null
}

/**
 * Build a map of secret ownership: { "HEIMDALL_API_KEY": "heimdall", ... }
 * showing which service owns each secret.
 */
export function getSecretOwnership(): Record<string, string> {
	const manifests = loadManifests()
	const ownership: Record<string, string> = {}

	for (const [serviceName, manifest] of Object.entries(manifests)) {
		for (const [varName, config] of Object.entries(manifest.vars)) {
			if (config.type === 'secret') {
				ownership[varName] = serviceName
			}
		}
	}

	return ownership
}

/**
 * Build a map of secret consumers: { "HEIMDALL_API_KEY": ["heimdall", "bifrost"], ... }
 * showing which services use each secret (either as owner or via ref).
 */
export function getSecretConsumers(): Record<string, string[]> {
	const manifests = loadManifests()
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
