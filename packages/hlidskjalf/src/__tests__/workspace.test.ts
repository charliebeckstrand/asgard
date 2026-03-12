import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorkspaceEntry } from '../lib/types.js'
import { discoverWorkspaces, filterWorkspaces, sortByDependencyOrder } from '../lib/workspace.js'

function createTmpWorkspace() {
	const root = join(tmpdir(), `hlidskjalf-test-${Date.now()}`)

	mkdirSync(join(root, 'packages', 'alpha'), { recursive: true })
	mkdirSync(join(root, 'packages', 'beta'), { recursive: true })
	mkdirSync(join(root, 'services', 'gamma'), { recursive: true })

	writeFileSync(
		join(root, 'packages', 'alpha', 'package.json'),
		JSON.stringify({
			name: 'alpha',
			scripts: { dev: 'tsup --watch' },
			dependencies: {},
		}),
	)

	writeFileSync(
		join(root, 'packages', 'beta', 'package.json'),
		JSON.stringify({
			name: 'beta',
			scripts: { dev: 'tsup --watch' },
			dependencies: { alpha: 'workspace:*' },
		}),
	)

	writeFileSync(
		join(root, 'services', 'gamma', 'package.json'),
		JSON.stringify({
			name: 'gamma',
			scripts: { dev: 'tsx watch src/index.ts' },
			dependencies: { alpha: 'workspace:*', beta: 'workspace:*' },
		}),
	)

	writeFileSync(
		join(root, 'services', 'gamma', 'manifest.json'),
		JSON.stringify({ name: 'gamma', port: 4000 }),
	)

	return root
}

describe('discoverWorkspaces', () => {
	it('discovers packages and services', () => {
		const root = createTmpWorkspace()
		const entries = discoverWorkspaces(root)

		expect(entries).toHaveLength(3)

		const alpha = entries.find((e) => e.name === 'alpha')

		expect(alpha?.type).toBe('package')
		expect(alpha?.dependencies).toEqual([])

		const beta = entries.find((e) => e.name === 'beta')

		expect(beta?.type).toBe('package')
		expect(beta?.dependencies).toEqual(['alpha'])

		const gamma = entries.find((e) => e.name === 'gamma')

		expect(gamma?.type).toBe('service')
		expect(gamma?.port).toBe(4000)
		expect(gamma?.dependencies).toEqual(['alpha', 'beta'])
	})

	it('skips directories without package.json', () => {
		const root = createTmpWorkspace()

		mkdirSync(join(root, 'packages', 'empty'), { recursive: true })

		const entries = discoverWorkspaces(root)

		expect(entries).toHaveLength(3)
	})
})

describe('sortByDependencyOrder', () => {
	it('sorts packages before services', () => {
		const entries: WorkspaceEntry[] = [
			{ name: 'svc', type: 'service', path: '/svc', dependencies: [] },
			{ name: 'pkg', type: 'package', path: '/pkg', dependencies: [] },
		]

		const sorted = sortByDependencyOrder(entries)

		expect(sorted[0].name).toBe('pkg')
		expect(sorted[1].name).toBe('svc')
	})

	it('sorts by dependency count within same type', () => {
		const entries: WorkspaceEntry[] = [
			{ name: 'beta', type: 'package', path: '/beta', dependencies: ['alpha'] },
			{ name: 'alpha', type: 'package', path: '/alpha', dependencies: [] },
		]

		const sorted = sortByDependencyOrder(entries)

		expect(sorted[0].name).toBe('alpha')
		expect(sorted[1].name).toBe('beta')
	})
})

describe('filterWorkspaces', () => {
	const entries: WorkspaceEntry[] = [
		{ name: 'alpha', type: 'package', path: '/alpha', dependencies: [] },
		{ name: 'beta', type: 'package', path: '/beta', dependencies: ['alpha'] },
		{ name: 'gamma', type: 'service', path: '/gamma', dependencies: ['alpha', 'beta'] },
	]

	it('filters by exact name', () => {
		const result = filterWorkspaces(entries, ['gamma'])

		expect(result).toHaveLength(1)
		expect(result[0].name).toBe('gamma')
	})

	it('includes transitive dependencies with ... suffix', () => {
		const result = filterWorkspaces(entries, ['gamma...'])

		expect(result).toHaveLength(3)
	})

	it('handles multiple filters', () => {
		const result = filterWorkspaces(entries, ['alpha', 'beta'])

		expect(result).toHaveLength(2)
	})
})
