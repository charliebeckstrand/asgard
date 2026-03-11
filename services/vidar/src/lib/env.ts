import { createEnvironment } from 'grid'
import { z } from 'zod'

export const environment = createEnvironment({
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	VIDAR_API_KEY: z.string().optional(),
	HUGINN_URL: z.string().optional(),
	HUGINN_API_KEY: z.string().optional(),
	AI_ENABLED: z
		.enum(['true', 'false'])
		.default('false')
		.transform((v) => v === 'true'),
})

export type Environment = ReturnType<typeof environment>
