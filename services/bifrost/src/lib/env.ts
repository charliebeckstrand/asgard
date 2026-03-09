import { createEnvLoader } from 'frigg'
import { z } from 'zod'

export const loadEnv = createEnvLoader({
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	SECRET_KEY: z.string().min(32, 'SECRET_KEY must be at least 32 characters'),
	SESSION_SECRET: z.string().min(32).optional(),
	VIDAR_URL: z.string().optional(),
	VIDAR_API_KEY: z.string().optional(),
	HEIMDALL_API_KEY: z.string().optional(),
	ACCESS_TOKEN_EXPIRE_MINUTES: z.coerce.number().default(30),
	REFRESH_TOKEN_EXPIRE_DAYS: z.coerce.number().default(7),
	CORS_ORIGIN: z.string().default('http://localhost:3000'),
})

export type Env = ReturnType<typeof loadEnv>
