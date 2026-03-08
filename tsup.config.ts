import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { defineConfig } from "tsup"

function findWorkspaceRoot(from: string): string {
	let dir = resolve(from)
	while (dir !== dirname(dir)) {
		if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir
		dir = dirname(dir)
	}
	return resolve(from)
}

function getWorkspacePackageNames(): string[] {
	const root = findWorkspaceRoot(process.cwd())
	const servicesDir = join(root, "services")
	return readdirSync(servicesDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const pkgPath = join(servicesDir, entry.name, "package.json")
			try {
				return JSON.parse(readFileSync(pkgPath, "utf-8")).name as string
			} catch {
				return null
			}
		})
		.filter((name): name is string => name !== null)
}

export default defineConfig({
	entry: {
		index: "src/index.ts",
	},
	format: ["esm"],
	target: "node22",
	noExternal: getWorkspacePackageNames(),
	outDir: "dist",
	clean: true,
	dts: true,
	sourcemap: true,
	splitting: false,
})
