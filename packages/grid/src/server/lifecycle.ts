import type { Server } from 'node:net'
import type { Logger } from 'pino'

export interface LifecycleOptions {
	server: Server
	logger: Logger
	onShutdown?: () => Promise<void>
}

const MAX_RETRIES = 5
const RETRY_DELAY_MS = 500

// Open streams keep server.close() waiting, so shutdown gives up after this.
const SHUTDOWN_TIMEOUT_MS = 10_000

export function setupLifecycle({ server, logger, onShutdown }: LifecycleOptions) {
	let retries = 0

	server.on('error', (error: NodeJS.ErrnoException & { port?: number }) => {
		if (error.code !== 'EADDRINUSE' || !error.port) throw error

		if (retries >= MAX_RETRIES) {
			logger.fatal({ port: error.port }, `port still in use after ${MAX_RETRIES} retries`)

			process.exit(1)
		}

		retries++

		logger.warn({ port: error.port, retries }, `port in use, retrying in ${RETRY_DELAY_MS}ms`)

		setTimeout(() => server.listen(error.port), RETRY_DELAY_MS)
	})

	let shuttingDown = false

	async function shutdown(signal: NodeJS.Signals) {
		if (shuttingDown) return

		shuttingDown = true

		setTimeout(() => {
			logger.fatal({ signal }, `did not shut down within ${SHUTDOWN_TIMEOUT_MS}ms`)

			process.exit(1)
		}, SHUTDOWN_TIMEOUT_MS).unref()

		await server[Symbol.asyncDispose]()

		await onShutdown?.()

		logger.info({ signal }, 'shut down')

		process.exit(0)
	}

	for (const signal of ['SIGINT', 'SIGTERM'] as const) {
		process.once(signal, () => {
			shutdown(signal).catch((err: unknown) => {
				logger.fatal({ err, signal }, 'failed to shut down cleanly')

				process.exit(1)
			})
		})
	}
}
