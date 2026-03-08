import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { defineConfig } from 'tsup'

function findWorkspaceRoot(from: string): string {
	let dir = resolve(from)
	while (dir !== dirname(dir)) {
		if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
		dir = dirname(dir)
	}
	return resolve(from)
}

/**
 * Determine which workspace packages to inline and where their
 * node_modules live (for pnpm strict isolation).
 *
 * Only workspace packages that appear in the current service's
 * `dependencies` are inlined — not every package in the monorepo.
 */
function getInlinedWorkspaceInfo(): {
	noExternal: string[]
	nodePaths: string[]
} {
	const root = findWorkspaceRoot(process.cwd())
	const servicesDir = join(root, 'services')

	// Build a map of workspace package name → directory path
	const workspaceDirs = new Map<string, string>()
	for (const entry of readdirSync(servicesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue
		const pkgPath = join(servicesDir, entry.name, 'package.json')
		try {
			const name = JSON.parse(readFileSync(pkgPath, 'utf-8')).name as string
			workspaceDirs.set(name, join(servicesDir, entry.name))
		} catch {}
	}

	// Read the current package's dependencies
	const currentPkg = JSON.parse(readFileSync('package.json', 'utf-8'))
	const deps = Object.keys(currentPkg.dependencies ?? {})

	// Only inline workspace packages that are actual dependencies
	const noExternal: string[] = []
	const nodePaths = [join(root, 'node_modules')]

	for (const dep of deps) {
		const dir = workspaceDirs.get(dep)
		if (!dir) continue
		noExternal.push(dep)
		const nm = join(dir, 'node_modules')
		if (existsSync(nm)) nodePaths.push(nm)
	}

	return { noExternal, nodePaths }
}

export default defineConfig(() => {
	const { noExternal, nodePaths } = getInlinedWorkspaceInfo()

	return {
		entry: {
			index: 'src/index.ts',
		},
		format: ['esm'],
		target: 'node22',
		noExternal,
		outDir: 'dist',
		clean: true,
		dts: true,
		sourcemap: true,
		splitting: false,
		esbuildOptions(options) {
			// When inlining workspace packages via noExternal, esbuild needs to
			// resolve their third-party deps (e.g. "pg" from mimir). Under pnpm
			// strict isolation these live in each service's own node_modules.
			options.nodePaths = nodePaths
		},
	}
})
