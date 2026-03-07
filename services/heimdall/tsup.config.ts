import { defineConfig } from "tsup"

export default defineConfig({
	entry: {
		index: "src/index.ts",
	},
	format: ["esm"],
	target: "node22",
	noExternal: ["mimir"],
	outDir: "dist",
	clean: true,
	dts: true,
	sourcemap: true,
	splitting: false,
})
