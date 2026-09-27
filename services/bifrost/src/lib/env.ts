import { createEnvironment } from 'grid/environment'
import { z } from 'zod'

const optionalValue = z
	.string()
	.optional()
	.transform((v) => (v && v.length > 0 ? v : undefined))

const databaseCaCert = z.string().min(1, 'DATABASE_CA_CERT is required in production')

const mimirUrl = z.string().min(1, 'MIMIR_URL is required in production')

const mimirApiKey = z.string().min(32, 'MIMIR_API_KEY must be at least 32 characters')

const clientIpSecret = z.string().min(32, 'CLIENT_IP_SECRET must be at least 32 characters')

export const environment = createEnvironment({
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	// PEM of the database server's CA. Unset encrypts without verifying the server,
	// so production requires it: a lost binding fails the deploy instead of letting
	// anyone on the path pose as the database.
	DATABASE_CA_CERT:
		process.env.NODE_ENV === 'production' ? databaseCaCert : databaseCaCert.optional(),
	// Unset disables Vidar; login and register keep their local rate limits.
	VIDAR_URL: z.string().optional(),
	VIDAR_API_KEY: z.string().optional(),
	// Mimir keeps the apps' data. Unset answers 503 on those routes, so production
	// requires it: a lost setting fails the deploy instead of every app's data.
	MIMIR_URL: process.env.NODE_ENV === 'production' ? mimirUrl : mimirUrl.optional(),
	MIMIR_API_KEY: process.env.NODE_ENV === 'production' ? mimirApiKey : mimirApiKey.optional(),
	// Shared with Midgard, whose proxy sends the browser address in `x-client-ip`.
	// Required in production, so a lost secret fails the deploy instead of putting
	// every browser in one rate-limit bucket.
	CLIENT_IP_SECRET:
		process.env.NODE_ENV === 'production' ? clientIpSecret : clientIpSecret.optional(),
	// The domain passkeys belong to. Every app origin must be on it or a subdomain of it.
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
	// OAuth clients for signing in with GitHub and Google. A provider without both
	// values is off.
	OAUTH_GITHUB_CLIENT_ID: optionalValue,
	OAUTH_GITHUB_CLIENT_SECRET: optionalValue,
	OAUTH_GOOGLE_CLIENT_ID: optionalValue,
	OAUTH_GOOGLE_CLIENT_SECRET: optionalValue,
	// Sends email, such as verification and password reset links, through Resend.
	// Unset logs each email instead.
	RESEND_API_KEY: optionalValue,
	// Cloudflare Turnstile on sign-up, so scripts can't make accounts or spend the
	// day's emails. Without both values, sign-up has no check.
	TURNSTILE_SITE_KEY: optionalValue,
	TURNSTILE_SECRET_KEY: optionalValue,
	// The sender of every email. Its domain must be verified in Resend.
	EMAIL_FROM: z.string().default('Bifrost <no-reply@localhost>'),
	// Comma-separated origins of the apps that use Bifrost. They set CORS, CSRF,
	// passkey origins and where redirects and emailed links may point.
	APP_ORIGINS: z
		.string()
		.default('http://localhost:3000')
		.transform((v) => v.split(',')),
})
