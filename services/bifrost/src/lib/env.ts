import { createEnvironment } from 'grid/environment'
import { z } from 'zod'

const clientIpSecret = z.string().min(32, 'CLIENT_IP_SECRET must be at least 32 characters')

export const environment = createEnvironment({
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	// PEM of the database server's CA. Unset encrypts without verifying the server.
	DATABASE_CA_CERT: z
		.string()
		.optional()
		.transform((v) => (v && v.length > 0 ? v : undefined)),
	// Unset disables Vidar; login and register keep their local rate limits.
	VIDAR_URL: z.string().optional(),
	VIDAR_API_KEY: z.string().optional(),
	// Shared with Midgard, whose proxy sends the browser address in `x-client-ip`.
	// Required in production, so a lost secret fails the deploy instead of putting
	// every browser in one rate-limit bucket.
	CLIENT_IP_SECRET:
		process.env.NODE_ENV === 'production' ? clientIpSecret : clientIpSecret.optional(),
	// The domain passkeys belong to. Every CORS origin must be on it or a subdomain of it.
	PASSKEY_DOMAIN: z.string().default('localhost'),
	// Encrypts authenticator-app secrets. Unset turns authenticator apps off. Changing
	// it breaks every authenticator app already added.
	MFA_ENCRYPTION_KEY: z
		.string()
		.optional()
		.refine(
			(v) => !v || v.length >= 32,
			'MFA_ENCRYPTION_KEY must be at least 32 characters when set',
		)
		.transform((v) => (v && v.length > 0 ? v : undefined)),
	// Comma-separated, so each consuming app's origin can be allowed.
	CORS_ORIGIN: z
		.string()
		.default('http://localhost:3000')
		.transform((v) => v.split(',')),
})
