import { createEnvLoader } from 'frigg'
import { z } from 'zod'

export const loadEnv = createEnvLoader({
	DATABASE_URL: z.string().optional(),
	HUGINN_API_KEY: z.string().optional(),
})

export type Env = ReturnType<typeof loadEnv>
