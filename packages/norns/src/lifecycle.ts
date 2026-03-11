import type { Server } from 'node:net'

export interface LifecycleOptions {
	server: Server
	name: string
	onShutdown?: () => Promise<void>
}

export function setupLifecycle({ server, name, onShutdown }: LifecycleOptions) {
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
