import { serve } from '@hono/node-server'
import { setupLifecycle } from 'grid/server-lifecycle'
import { configure as configureVidar, reportEvent } from 'vidar/client'
import { createBifrostApp } from './app.js'
import {
	configure,
	deleteExpiredChallenges,
	deleteExpiredOAuthStates,
	deleteExpiredSessions,
	deleteExpiredTickets,
	type OAuthClient,
} from './auth/index.js'
import { db } from './lib/db.js'
import { environment } from './lib/env.js'
import { logger } from './lib/log.js'
import { createMfaRepository } from './lib/mfa-repository.js'
import { createOAuthRepository } from './lib/oauth-repository.js'
import { createPasskeyRepository } from './lib/passkey-repository.js'
import { createSessionRepository } from './lib/session-repository.js'
import { createUserRepository } from './lib/user-repository.js'

const env = environment()

function oauthClient(clientId?: string, clientSecret?: string): OAuthClient | undefined {
	return clientId && clientSecret ? { clientId, clientSecret } : undefined
}
const log = logger()

configureVidar({
	vidarUrl: env.VIDAR_URL,
	vidarApiKey: env.VIDAR_API_KEY,
	logger: log,
})

configure({
	userRepository: createUserRepository(),
	sessionRepository: createSessionRepository(),
	passkeyRepository: createPasskeyRepository(),
	mfaRepository: createMfaRepository(),
	oauthRepository: createOAuthRepository(),
	passkeys: { domain: env.PASSKEY_DOMAIN, origins: env.CORS_ORIGIN },
	mfa: { key: env.MFA_ENCRYPTION_KEY, issuer: env.PASSKEY_DOMAIN },
	oauth: {
		github: oauthClient(env.OAUTH_GITHUB_CLIENT_ID, env.OAUTH_GITHUB_CLIENT_SECRET),
		google: oauthClient(env.OAUTH_GOOGLE_CLIENT_ID, env.OAUTH_GOOGLE_CLIENT_SECRET),
	},
	onSecurityEvent: (event) => reportEvent(event.type, event.ip, event.details ?? {}, 'bifrost'),
})

const app = createBifrostApp()

const SWEEP_INTERVAL_MS = 3_600_000 // 1 hour

const sweepTimer = setInterval(() => {
	Promise.all([
		deleteExpiredSessions(),
		deleteExpiredChallenges(),
		deleteExpiredTickets(),
		deleteExpiredOAuthStates(),
	]).catch((err) => {
		log.error({ err }, 'failed to delete expired sessions, challenges, tickets and OAuth states')
	})
}, SWEEP_INTERVAL_MS)

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		log.info(
			{ port: info.port, docs: '/api/docs' },
			`bifrost listening on http://localhost:${info.port}`,
		)
	},
)

setupLifecycle({
	server,
	name: 'Bifrost',
	onShutdown: async () => {
		clearInterval(sweepTimer)

		await db.close()
	},
})
