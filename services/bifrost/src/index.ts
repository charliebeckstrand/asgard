import { serve } from '@hono/node-server'
import { setupLifecycle } from 'grid/server-lifecycle'
import { configure as configureVidar } from 'vidar/client'
import { createBifrostApp } from './app.js'
import {
	checkMfaKey,
	deleteExpiredChallenges,
	deleteExpiredEmailTokens,
	deleteExpiredOAuthStates,
	deleteExpiredSessions,
	deleteOldActivity,
	deleteOldSentEmails,
	deleteOldSignUps,
	deleteStaleFailedLogins,
	deleteStaleFailedSteps,
} from './auth/index.js'
import { db } from './lib/db.js'
import { environment } from './lib/env.js'
import { logger } from './lib/log.js'

const env = environment()

const log = logger()

configureVidar({
	vidarUrl: env.VIDAR_URL,
	vidarApiKey: env.VIDAR_API_KEY,
	service: 'bifrost',
	logger: log,
})

// A key that can't read the stored secrets would break every authenticator app,
// so bifrost doesn't start. The health check then fails the deploy, and the old
// version keeps serving. When the database can't be reached, bifrost starts
// anyway, as it would without this check.
const mfaKeyProblem = await checkMfaKey().catch((err: unknown) => {
	log.error({ err }, 'could not check MFA_ENCRYPTION_KEY')

	return null
})

if (mfaKeyProblem) {
	log.fatal(mfaKeyProblem)

	process.exit(1)
}

const app = createBifrostApp()

const SWEEP_INTERVAL_MS = 3_600_000 // 1 hour

const sweeps = {
	sessions: deleteExpiredSessions,
	challenges: deleteExpiredChallenges,
	'OAuth states': deleteExpiredOAuthStates,
	'failed logins': deleteStaleFailedLogins,
	'sign-up counts': deleteOldSignUps,
	'failed second steps': deleteStaleFailedSteps,
	'email links': deleteExpiredEmailTokens,
	'email counts': deleteOldSentEmails,
	activity: deleteOldActivity,
}

/** Deletes what has expired, each table on its own, so one failure doesn't hide the others. */
function sweep() {
	for (const [name, run] of Object.entries(sweeps)) {
		run().catch((err: unknown) => {
			log.error({ err }, `failed to delete old ${name}`)
		})
	}
}

// Also on start, so deploys more often than hourly don't skip it.
sweep()

const sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS)

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
