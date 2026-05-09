import { createEnvironment } from 'grid/environment'
import { z } from 'zod'

export const environment = createEnvironment({
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	SECRET_KEY: z.string().min(32, 'SECRET_KEY must be at least 32 characters'),
	PREVIOUS_SECRET_KEY: z
		.string()
		.optional()
		.refine(
			(v) => !v || v.length >= 32,
			'PREVIOUS_SECRET_KEY must be at least 32 characters when set',
		)
		.transform((v) => (v && v.length > 0 ? v : undefined)),
	CORS_ORIGIN: z.string().default('http://localhost:3000'),
})
