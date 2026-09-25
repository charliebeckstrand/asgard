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
	SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
	// Unset disables Vidar; login and register keep their local rate limits.
	VIDAR_URL: z.string().optional(),
	VIDAR_API_KEY: z.string().optional(),
	// Comma-separated, so each consuming app's origin can be allowed.
	CORS_ORIGIN: z
		.string()
		.default('http://localhost:3000')
		.transform((v) => v.split(',')),
})
