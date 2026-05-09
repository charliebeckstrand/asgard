import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const ManifestVarValueSchema = z.object({
	type: z.literal('value'),
	default: z.string().optional(),
})

const ManifestVarSecretSchema = z.object({
	type: z.literal('secret'),
})

const ManifestVarRefSchema = z.object({
	type: z.literal('ref'),
	service: z.string(),
	key: z.string().optional(),
})

const ManifestVarSchema = z.discriminatedUnion('type', [
	ManifestVarValueSchema,
	ManifestVarSecretSchema,
	ManifestVarRefSchema,
])

const ManifestDatabaseSchema = z.object({
	name: z.string(),
	role: z.string(),
	password: z.string(),
})

const ManifestSchema = z.object({
	name: z.string(),
	port: z.number(),
	database: ManifestDatabaseSchema.optional(),
	vars: z.record(z.string(), ManifestVarSchema).optional(),
})

export type ManifestVarValue = z.infer<typeof ManifestVarValueSchema>
export type ManifestVarSecret = z.infer<typeof ManifestVarSecretSchema>
export type ManifestVarRef = z.infer<typeof ManifestVarRefSchema>
export type ManifestVar = z.infer<typeof ManifestVarSchema>
export type ManifestDatabase = z.infer<typeof ManifestDatabaseSchema>
export type Manifest = z.infer<typeof ManifestSchema>

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

function readManifest(dir: string): Manifest {
	const path = resolve(dir, 'manifest.json')
	const parsed = ManifestSchema.safeParse(JSON.parse(readFileSync(path, 'utf-8')))

	if (!parsed.success) {
		throw new Error(`Invalid manifest at ${path}: ${parsed.error.message}`)
	}

	return parsed.data
}

export function getManifestPort(): number {
	const dir = walkUpFor(process.cwd(), 'manifest.json')

	return readManifest(dir).port
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

			if (!existsSync(resolve(dir, 'manifest.json'))) continue

			const manifest = readManifest(dir)

			found.set(manifest.name, { manifest, dir })
		}
	}

	return found
}
