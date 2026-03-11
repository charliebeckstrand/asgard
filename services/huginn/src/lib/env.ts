import { createEnvironment } from 'grid'
import { z } from 'zod'

export const environment = createEnvironment({
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	HUGINN_API_KEY: z.string().optional(),
	CORS_ORIGIN: z.string().default('http://localhost:3000'),
})

export type Environment = ReturnType<typeof environment>
