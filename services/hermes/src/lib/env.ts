import { createEnvironment } from 'grid'
import { z } from 'zod'

export const environment = createEnvironment({
	CORS_ORIGIN: z.string().default('http://localhost:3000'),
	HERMES_API_KEY: z.string().optional(),
})

export type Environment = ReturnType<typeof environment>
