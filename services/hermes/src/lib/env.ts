import { createEnvironment } from 'grid/environment'
import { z } from 'zod'

export const environment = createEnvironment({
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	SECRET_KEY: z.string().min(32, 'SECRET_KEY must be at least 32 characters'),
})
