import { createEnvironment } from 'grid/environment'
import { z } from 'zod'

const databaseCaCert = z.string().min(1, 'DATABASE_CA_CERT is required in production')

export const environment = createEnvironment({
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	// PEM of the database server's CA. Unset encrypts without verifying the server,
	// so production requires it: a lost binding fails the deploy instead of letting
	// anyone on the path pose as the database.
	DATABASE_CA_CERT:
		process.env.NODE_ENV === 'production' ? databaseCaCert : databaseCaCert.optional(),
	MIMIR_API_KEY: z.string().min(32, 'MIMIR_API_KEY must be at least 32 characters'),
})
