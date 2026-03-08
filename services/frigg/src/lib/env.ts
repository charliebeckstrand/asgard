import { z } from 'zod'

const envSchema = z.object({
	PORT: z.coerce.number().default(3003),
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	FRIGG_SECRET_KEY: z.string().length(64, 'FRIGG_SECRET_KEY must be a 64-char hex string'),
	FRIGG_API_KEY: z.string().optional(),
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
