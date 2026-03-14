import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
