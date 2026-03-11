import { createEnvironment } from 'grid'
import { z } from 'zod'

export const environment = createEnvironment({
	CORS_ORIGIN: z.string().default('http://localhost:3000'),
	HUGINN_URL: z.string().default('http://localhost:3002'),
	HUGINN_API_KEY: z.string().optional(),
	VIDAR_URL: z.string().default('http://localhost:3003'),
	VIDAR_API_KEY: z.string().optional(),
})

export type Environment = ReturnType<typeof environment>
