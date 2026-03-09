import { createEnvLoader } from 'frigg'
import { z } from 'zod'

export const loadEnv = createEnvLoader({
	HEIMDALL_URL: z.string().url().optional(),
	HEIMDALL_API_KEY: z.string().optional(),
	SESSION_SECRET: z.string().min(32).optional(),
})

export type Env = ReturnType<typeof loadEnv>
