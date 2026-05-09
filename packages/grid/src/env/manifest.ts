import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface ManifestVarValue {
	type: 'value'
	default?: string
}

export interface ManifestVarSecret {
	type: 'secret'
}

export interface ManifestVarRef {
	type: 'ref'
	service: string
	key?: string
}

export type ManifestVar = ManifestVarValue | ManifestVarSecret | ManifestVarRef

export interface ManifestDatabase {
	name: string
	role: string
	password: string
}

export interface Manifest {
	name: string
	port: number
	database?: ManifestDatabase
	vars?: Record<string, ManifestVar>
}

export interface DiscoveredManifest {
	manifest: Manifest
	dir: string
}

export function getManifestPort(): number {
	let dir = process.cwd()

	while (!existsSync(resolve(dir, 'manifest.json'))) {
		const parent = resolve(dir, '..')

		if (parent === dir) throw new Error('manifest.json not found')

		dir = parent
	}

	const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf-8'))

	return manifest.port
}

export function findWorkspaceRoot(start: string = process.cwd()): string {
	let dir = start

	while (!existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
		const parent = resolve(dir, '..')

		if (parent === dir) throw new Error('pnpm-workspace.yaml not found')

		dir = parent
	}

	return dir
}

const MANIFEST_DIRS = ['apps', 'services']

export function discoverManifests(workspaceRoot: string): Map<string, DiscoveredManifest> {
	const found = new Map<string, DiscoveredManifest>()

	for (const subdir of MANIFEST_DIRS) {
		const root = resolve(workspaceRoot, subdir)

		if (!existsSync(root)) continue

		for (const entry of readdirSync(root, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue

			const dir = resolve(root, entry.name)

			const manifestPath = resolve(dir, 'manifest.json')

			if (!existsSync(manifestPath)) continue

			const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Manifest

			const name = manifest.name || entry.name

			found.set(name, { manifest, dir })
		}
	}

	return found
}
