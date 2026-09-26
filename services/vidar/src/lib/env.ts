import { createEnvironment } from 'grid/environment'
import { z } from 'zod'

export const environment = createEnvironment({
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	// PEM of the database server's CA. Unset encrypts without verifying the server.
	DATABASE_CA_CERT: z
		.string()
		.optional()
		.transform((v) => (v && v.length > 0 ? v : undefined)),
	VIDAR_API_KEY: z.string().min(32, 'VIDAR_API_KEY must be at least 32 characters'),
})
