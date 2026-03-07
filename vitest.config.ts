import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		passWithNoTests: true,
		server: {
			deps: {
				inline: ["mimir"],
			},
		},
	},
	resolve: {
		alias: {
			"@": "./src",
		},
	},
})
