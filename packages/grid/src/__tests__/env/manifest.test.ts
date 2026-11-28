import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTempDir } from 'vali/fixtures'
import { discoverManifests, findWorkspaceRoot } from '../../env/manifest.js'

describe('findWorkspaceRoot', () => {
	it('walks up to a directory containing pnpm-workspace.yaml', async () => {
		const tmp = await createTempDir('grid-workspace-')

		await writeFile(join(tmp.path, 'pnpm-workspace.yaml'), '')
		await mkdir(join(tmp.path, 'a/b/c'), { recursive: true })

		expect(findWorkspaceRoot(join(tmp.path, 'a/b/c'))).toBe(tmp.path)

		await tmp.cleanup()
	})

	it('throws when no workspace root is found', () => {
		expect(() => findWorkspaceRoot('/')).toThrow('pnpm-workspace.yaml not found')
	})
})

describe('discoverManifests', () => {
	it('finds the manifest of each service', async () => {
		const tmp = await createTempDir('grid-discover-')

		await mkdir(join(tmp.path, 'services/alpha'), { recursive: true })
		await mkdir(join(tmp.path, 'services/beta'), { recursive: true })

		await writeFile(
			join(tmp.path, 'services/alpha/manifest.json'),
			JSON.stringify({ name: 'alpha', port: 4000 }),
		)
		await writeFile(
			join(tmp.path, 'services/beta/manifest.json'),
			JSON.stringify({ name: 'beta', port: 4001 }),
		)

		const found = discoverManifests(tmp.path)

		expect([...found.keys()].sort()).toEqual(['alpha', 'beta'])

		expect(found.get('alpha')?.manifest.port).toBe(4000)

		expect(found.get('beta')?.dir).toBe(join(tmp.path, 'services/beta'))

		await tmp.cleanup()
	})

	it('names the problem in an invalid manifest', async () => {
		const tmp = await createTempDir('grid-discover-')

		await mkdir(join(tmp.path, 'services/alpha'), { recursive: true })

		await writeFile(
			join(tmp.path, 'services/alpha/manifest.json'),
			JSON.stringify({ name: 'alpha' }),
		)

		expect(() => discoverManifests(tmp.path)).toThrow(/Invalid manifest at [\s\S]*at port/)

		await tmp.cleanup()
	})

	it('skips entries without a manifest.json', async () => {
		const tmp = await createTempDir('grid-discover-')

		await mkdir(join(tmp.path, 'services/with'), { recursive: true })
		await mkdir(join(tmp.path, 'services/without'), { recursive: true })

		await writeFile(
			join(tmp.path, 'services/with/manifest.json'),
			JSON.stringify({ name: 'with', port: 4000 }),
		)

		const found = discoverManifests(tmp.path)

		expect([...found.keys()]).toEqual(['with'])

		await tmp.cleanup()
	})

	it('returns an empty map when there is no services/ folder', async () => {
		const tmp = await createTempDir('grid-discover-')

		const found = discoverManifests(tmp.path)

		expect(found.size).toBe(0)

		await tmp.cleanup()
	})
})
