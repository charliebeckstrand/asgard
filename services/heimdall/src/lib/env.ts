import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

function getManifestPort(): number {
	const manifest = JSON.parse(
		readFileSync(resolve(import.meta.dirname, '..', 'manifest.json'), 'utf-8'),
	)

	return manifest.port
}

const envSchema = z.object({
	PORT: z.coerce.number().default(getManifestPort()),
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	SECRET_KEY: z.string().min(1, 'SECRET_KEY is required'),
	CORS_ORIGINS: z.string().optional(),
	HEIMDALL_API_KEY: z.string().optional(),
	VIDAR_URL: z.string().optional(),
	VIDAR_API_KEY: z.string().optional(),
	ACCESS_TOKEN_EXPIRE_MINUTES: z.coerce.number().default(30),
	REFRESH_TOKEN_EXPIRE_DAYS: z.coerce.number().default(7),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function loadEnv(): Env {
	if (cached) return cached

	const result = envSchema.safeParse(process.env)

	if (!result.success) {
		console.error('Invalid environment variables:', result.error.format())

		process.exit(1)
	}

	cached = result.data

	return cached
}
