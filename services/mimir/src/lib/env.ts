import { createEnvironment } from 'grid/environment'
import { z } from 'zod'

const databaseCaCert = z.string().min(1, 'DATABASE_CA_CERT is required in production')

const production = process.env.NODE_ENV === 'production'

/** Required in production, so a lost setting fails the deploy. Elsewhere unset turns photos off. */
const spacesValue = (name: string) => {
	const value = z.string().min(1, `${name} is required in production`)

	return production ? value : value.optional()
}

export const environment = createEnvironment({
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	// PEM of the database server's CA. Unset encrypts without verifying the server,
	// so production requires it: a lost binding fails the deploy instead of letting
	// anyone on the path pose as the database.
	DATABASE_CA_CERT: production ? databaseCaCert : databaseCaCert.optional(),
	MIMIR_API_KEY: z.string().min(32, 'MIMIR_API_KEY must be at least 32 characters'),
	// The DigitalOcean Spaces bucket that keeps photos, and a key that can read,
	// write and delete in it. The endpoint is the region's, such as
	// https://nyc3.digitaloceanspaces.com.
	SPACES_KEY: spacesValue('SPACES_KEY'),
	SPACES_SECRET: spacesValue('SPACES_SECRET'),
	SPACES_REGION: spacesValue('SPACES_REGION'),
	SPACES_BUCKET: spacesValue('SPACES_BUCKET'),
	SPACES_ENDPOINT: spacesValue('SPACES_ENDPOINT'),
})
