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

function walkUpFor(start: string, marker: string): string {
	let dir = start

	while (!existsSync(resolve(dir, marker))) {
		const parent = resolve(dir, '..')

		if (parent === dir) throw new Error(`${marker} not found`)

		dir = parent
	}

	return dir
}

export function getManifestPort(): number {
	const dir = walkUpFor(process.cwd(), 'manifest.json')

	const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf-8'))

	return manifest.port
}

export function findWorkspaceRoot(start: string = process.cwd()): string {
	return walkUpFor(start, 'pnpm-workspace.yaml')
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

			found.set(manifest.name, { manifest, dir })
		}
	}

	return found
}
