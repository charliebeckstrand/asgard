import { createEnvironment } from 'grid'
import { z } from 'zod'

export const environment = createEnvironment({
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	SECRET_KEY: z.string().min(32, 'SECRET_KEY must be at least 32 characters'),
	SESSION_SECRET: z.string().min(32).optional(),
	HUGINN_URL: z.string().default('http://localhost:3002'),
	VIDAR_URL: z.string().optional(),
	VIDAR_API_KEY: z.string().optional(),
	HEIMDALL_API_KEY: z.string().optional(),
	CORS_ORIGIN: z.string().default('http://localhost:3000'),
})

export type Environment = ReturnType<typeof environment>
