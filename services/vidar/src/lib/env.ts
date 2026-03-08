import { z } from 'zod'

const envSchema = z.object({
	PORT: z.coerce.number().default(3002),
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	VIDAR_API_KEY: z.string().optional(),
	RATATOSKR_URL: z.string().optional(),
	RATATOSKR_API_KEY: z.string().optional(),
	AI_ENABLED: z
		.enum(['true', 'false'])
		.default('false')
		.transform((v) => v === 'true'),
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
