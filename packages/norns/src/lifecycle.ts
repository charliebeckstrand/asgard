import type { Server } from 'node:net'

export interface LifecycleOptions {
	server: Server
	name: string
	onShutdown?: () => Promise<void>
}

const MAX_RETRIES = 5
const RETRY_DELAY_MS = 500

export function setupLifecycle({ server, name, onShutdown }: LifecycleOptions) {
	let retries = 0

	server.on('error', (error: NodeJS.ErrnoException & { port?: number }) => {
		if (error.code !== 'EADDRINUSE' || !error.port) throw error

		if (retries >= MAX_RETRIES) {
			console.error(
				`${name}: port ${error.port} still in use after ${MAX_RETRIES} retries, exiting.`,
			)

			process.exit(1)
		}

		retries++

		console.warn(
			`${name}: port ${error.port} in use, retrying in ${RETRY_DELAY_MS}ms (${retries}/${MAX_RETRIES})...`,
		)

		setTimeout(() => server.listen(error.port), RETRY_DELAY_MS)
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

		await onShutdown?.()

		console.log(`${name} shut down after ${signal}`)

		process.exit(0)
	}

	for (const signal of ['SIGINT', 'SIGTERM'] as const) {
		process.removeAllListeners(signal)

		process.once(signal, () => {
			void shutdown(signal).catch((error) => {
				console.error(`Failed to shut down ${name} cleanly after ${signal}`, error)

				process.exit(1)
			})
		})
	}
}
