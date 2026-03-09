import { createEnvLoader } from 'frigg'
import { z } from 'zod'

export const loadEnv = createEnvLoader({
	CORS_ORIGIN: z.string().default('http://localhost:3000'),
	HERMES_API_KEY: z.string().optional(),
})

export type Env = ReturnType<typeof loadEnv>
