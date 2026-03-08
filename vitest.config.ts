import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const servicesDir = resolve(__dirname, 'services')

/** Map workspace package names to their source entry points for Vite resolution. */
function workspaceAliases(): Record<string, string> {
	const aliases: Record<string, string> = {}
	for (const entry of readdirSync(servicesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue
		const pkgPath = join(servicesDir, entry.name, 'package.json')
		try {
			const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
			aliases[pkg.name] = join(servicesDir, entry.name, 'src', 'index.ts')
		} catch {}
	}
	return aliases
}

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		passWithNoTests: true,
	},
	resolve: {
		alias: {
			'@': './src',
			...workspaceAliases(),
		},
	},
})
