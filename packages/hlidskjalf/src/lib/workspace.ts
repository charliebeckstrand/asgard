import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { WorkspaceEntry, WorkspaceType } from './types.js'

interface PackageJson {
	name?: string
	scripts?: Record<string, string>
	dependencies?: Record<string, string>
}

interface Manifest {
	name?: string
	port?: number
}

function readJson<T>(path: string): T | null {
	try {
		return JSON.parse(readFileSync(path, 'utf-8')) as T
	} catch {
		return null
	}
}

function classifyEntry(dir: string, pkg: PackageJson): WorkspaceType {
	const manifest = join(dir, 'manifest.json')

	if (existsSync(manifest)) return 'service'

	const devScript = pkg.scripts?.dev ?? ''

	if (devScript.includes('tsx watch')) return 'service'

	return 'package'
}

function getWorkspaceDeps(pkg: PackageJson): string[] {
	const deps: string[] = []

	for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
		if (version === 'workspace:*') {
			deps.push(name)
		}
	}

	return deps
}

export function discoverWorkspaces(root: string): WorkspaceEntry[] {
	const dirs = ['apps', 'packages', 'services']
	const entries: WorkspaceEntry[] = []

	for (const dir of dirs) {
		const base = join(root, dir)

		if (!existsSync(base)) continue

		for (const name of readdirSync(base)) {
			const entryPath = join(base, name)
			const pkgPath = join(entryPath, 'package.json')

			const pkg = readJson<PackageJson>(pkgPath)

			if (!pkg?.name) continue

			// Skip hlidskjalf itself
			if (pkg.name === 'hlidskjalf') continue

			const type = classifyEntry(entryPath, pkg)

			const manifest = readJson<Manifest>(join(entryPath, 'manifest.json'))

			entries.push({
				name: pkg.name,
				type,
				path: entryPath,
				port: manifest?.port,
				dependencies: getWorkspaceDeps(pkg),
			})
		}
	}

	return entries
}

/**
 * Returns workspace entries sorted so packages come before services,
 * and within each group, entries with fewer workspace dependencies come first.
 */
export function sortByDependencyOrder(entries: WorkspaceEntry[]): WorkspaceEntry[] {
	const entryNames = new Set(entries.map((e) => e.name))

	return [...entries].sort((a, b) => {
		// Packages before services
		if (a.type !== b.type) return a.type === 'package' ? -1 : 1

		// Within same type, sort by number of internal deps
		const aDeps = a.dependencies.filter((d) => entryNames.has(d)).length
		const bDeps = b.dependencies.filter((d) => entryNames.has(d)).length

		return aDeps - bDeps
	})
}

/**
 * Returns workspace entries sorted alphabetically by name,
 * with packages grouped before services.
 */
export function sortAlphabetically(entries: WorkspaceEntry[]): WorkspaceEntry[] {
	return [...entries].sort((a, b) => {
		// Packages before services
		if (a.type !== b.type) return a.type === 'package' ? -1 : 1

		// Alphabetical within same type
		return a.name.localeCompare(b.name)
	})
}

/**
 * Filters entries by name patterns, supporting the `...` suffix
 * to include transitive dependencies (like turbo --filter=name...).
 */
export function filterWorkspaces(entries: WorkspaceEntry[], patterns: string[]): WorkspaceEntry[] {
	const entryMap = new Map(entries.map((e) => [e.name, e]))
	const result = new Set<string>()

	for (const pattern of patterns) {
		const withDeps = pattern.endsWith('...')

		const name = withDeps ? pattern.slice(0, -3) : pattern

		if (entryMap.has(name)) {
			result.add(name)
		}

		if (withDeps) {
			addTransitiveDeps(name, entryMap, result)
		}
	}

	return entries.filter((e) => result.has(e.name))
}

function addTransitiveDeps(
	name: string,
	entryMap: Map<string, WorkspaceEntry>,
	result: Set<string>,
): void {
	const entry = entryMap.get(name)

	if (!entry) return

	for (const dep of entry.dependencies) {
		if (entryMap.has(dep) && !result.has(dep)) {
			result.add(dep)

			addTransitiveDeps(dep, entryMap, result)
		}
	}
}
