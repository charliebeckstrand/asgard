import { execSync } from 'node:child_process'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { closePool } from './lib/db.js'
import { loadEnv } from './lib/env.js'

const env = loadEnv()
const app = createApp()

const server = serve(
	{
		fetch: app.fetch,
		port: env.PORT,
	},
	(info) => {
		console.log(`Heimdall running on http://localhost:${info.port}`)
		console.log(`API docs available at http://localhost:${info.port}/auth/docs`)
	},
)

let portRetried = false

server.on('error', (error: NodeJS.ErrnoException) => {
	if (error.code === 'EADDRINUSE') {
		if (portRetried) {
			console.error(`Port ${env.PORT} is still in use after retry, exiting.`)
			process.exit(1)
		}

		portRetried = true
		console.warn(`Port ${env.PORT} is in use, attempting to free it...`)

		try {
			const cmd =
				process.platform === 'darwin'
					? `lsof -i :${env.PORT} | grep LISTEN | awk '{print $2}' | xargs kill -9`
					: `fuser -k ${env.PORT}/tcp`
			execSync(cmd, { stdio: 'ignore' })
		} catch {
			// Process may have already exited
		}

		server.listen(env.PORT)
	}
})

let shuttingDown = false

async function shutdown(signal: NodeJS.Signals) {
	if (shuttingDown) return

	shuttingDown = true

	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error)

				return
			}

			resolve()
		})
	})

	await closePool()

	console.log(`Heimdall shut down after ${signal}`)

	process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, () => {
		void shutdown(signal).catch((error) => {
			console.error(`Failed to shut down Heimdall cleanly after ${signal}`, error)

			process.exit(1)
		})
	})
}
