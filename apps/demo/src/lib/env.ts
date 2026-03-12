import { createEnvironment } from 'grid/environment'
import { z } from 'zod'

export const environment = createEnvironment({
	BIFROST_URL: z.string().default('http://localhost:3001'),
	SESSION_SECRET: z.string().min(32).optional(),
})
