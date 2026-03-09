import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

function getManifestPort(): number {
	let dir = import.meta.dirname

	while (!existsSync(resolve(dir, 'manifest.json'))) {
		const parent = resolve(dir, '..')

		if (parent === dir) throw new Error('manifest.json not found')

		dir = parent
	}

	const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf-8'))

	return manifest.port
}

const envSchema = z.object({
	PORT: z.coerce.number().default(getManifestPort()),
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	VIDAR_URL: z.string().optional(),
	VIDAR_API_KEY: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function loadEnv(): Env {
	if (cached) return cached

	const result = envSchema.safeParse(process.env)

	if (!result.success) {
		console.error('Invalid environment variables:', result.error.format())

		throw new Error('Invalid environment variables')
	}

	cached = result.data

	return cached
}
