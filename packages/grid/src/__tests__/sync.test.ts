import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTempDir } from 'vali/fixtures'
import { syncEnv } from '../env/sync.js'

async function writeManifest(
	root: string,
	subdir: string,
	name: string,
	manifest: object,
): Promise<void> {
	await mkdir(join(root, subdir, name), { recursive: true })

	await writeFile(join(root, subdir, name, 'manifest.json'), JSON.stringify(manifest))
}

async function readEnv(path: string): Promise<Record<string, string>> {
	const raw = await readFile(path, 'utf-8')

	return Object.fromEntries(
		raw
			.trim()
			.split('\n')
			.map((line) => {
				const idx = line.indexOf('=')

				return [line.slice(0, idx), line.slice(idx + 1)]
			}),
	)
}

describe('syncEnv', () => {
	it('writes resolved .env files for every manifest', async () => {
		const tmp = await createTempDir('grid-sync-')

		await writeFile(join(tmp.path, 'pnpm-workspace.yaml'), '')

		await writeManifest(tmp.path, 'services', 'alpha', {
			name: 'alpha',
			port: 4000,
			vars: { GREETING: { type: 'value', default: 'hi' } },
		})

		const result = syncEnv({ workspaceRoot: tmp.path })

		expect(result.written).toEqual(['alpha'])

		const env = await readEnv(join(tmp.path, 'services/alpha/.env'))

		expect(env.PORT).toBe('4000')
		expect(env.GREETING).toBe('hi')

		await tmp.cleanup()
	})

	it('generates and persists secrets across runs', async () => {
		const tmp = await createTempDir('grid-sync-')

		await writeFile(join(tmp.path, 'pnpm-workspace.yaml'), '')

		await writeManifest(tmp.path, 'services', 'alpha', {
			name: 'alpha',
			port: 4000,
			vars: { TOKEN: { type: 'secret' } },
		})

		const first = syncEnv({ workspaceRoot: tmp.path })

		expect(first.generated).toEqual(['alpha:TOKEN'])

		const env1 = await readEnv(join(tmp.path, 'services/alpha/.env'))

		const second = syncEnv({ workspaceRoot: tmp.path })

		expect(second.generated).toEqual([])

		const env2 = await readEnv(join(tmp.path, 'services/alpha/.env'))

		expect(env1.TOKEN).toBe(env2.TOKEN)
		expect(env1.TOKEN).toMatch(/^[a-f0-9]{64}$/)

		await tmp.cleanup()
	})

	it('rotates a single named secret when rotate is an array', async () => {
		const tmp = await createTempDir('grid-sync-')

		await writeFile(join(tmp.path, 'pnpm-workspace.yaml'), '')

		await writeManifest(tmp.path, 'services', 'alpha', {
			name: 'alpha',
			port: 4000,
			vars: { TOKEN: { type: 'secret' }, OTHER: { type: 'secret' } },
		})

		syncEnv({ workspaceRoot: tmp.path })

		const before = await readEnv(join(tmp.path, 'services/alpha/.env'))

		const result = syncEnv({ workspaceRoot: tmp.path, rotate: ['TOKEN'] })

		expect(result.rotated).toEqual(['alpha:TOKEN'])

		const after = await readEnv(join(tmp.path, 'services/alpha/.env'))

		expect(after.TOKEN).not.toBe(before.TOKEN)
		expect(after.OTHER).toBe(before.OTHER)

		await tmp.cleanup()
	})

	it('resolves cross-service refs to URLs and shared secrets', async () => {
		const tmp = await createTempDir('grid-sync-')

		await writeFile(join(tmp.path, 'pnpm-workspace.yaml'), '')

		await writeManifest(tmp.path, 'services', 'producer', {
			name: 'producer',
			port: 4001,
			vars: { API_KEY: { type: 'secret' } },
		})

		await writeManifest(tmp.path, 'services', 'consumer', {
			name: 'consumer',
			port: 4002,
			vars: {
				PRODUCER_URL: { type: 'ref', service: 'producer' },
				PRODUCER_KEY: { type: 'ref', service: 'producer', key: 'API_KEY' },
			},
		})

		syncEnv({ workspaceRoot: tmp.path })

		const producer = await readEnv(join(tmp.path, 'services/producer/.env'))
		const consumer = await readEnv(join(tmp.path, 'services/consumer/.env'))

		expect(consumer.PRODUCER_URL).toBe('http://localhost:4001')
		expect(consumer.PRODUCER_KEY).toBe(producer.API_KEY)

		await tmp.cleanup()
	})

	it('honors the services filter', async () => {
		const tmp = await createTempDir('grid-sync-')

		await writeFile(join(tmp.path, 'pnpm-workspace.yaml'), '')

		await writeManifest(tmp.path, 'services', 'alpha', { name: 'alpha', port: 4000 })
		await writeManifest(tmp.path, 'services', 'beta', { name: 'beta', port: 4001 })

		const result = syncEnv({ workspaceRoot: tmp.path, services: ['alpha'] })

		expect(result.written).toEqual(['alpha'])

		await tmp.cleanup()
	})

	it('throws when no manifests are discovered', async () => {
		const tmp = await createTempDir('grid-sync-')

		await writeFile(join(tmp.path, 'pnpm-workspace.yaml'), '')

		expect(() => syncEnv({ workspaceRoot: tmp.path })).toThrow(/No service manifests found/)

		await tmp.cleanup()
	})
})
