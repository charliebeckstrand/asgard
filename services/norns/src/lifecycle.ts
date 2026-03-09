import { execSync } from 'node:child_process'
import type { Server } from 'node:http'

export interface LifecycleOptions {
	server: Server
	name: string
	port: number
	onShutdown?: () => Promise<void>
}

export function setupLifecycle({ server, name, port, onShutdown }: LifecycleOptions) {
	let portRetried = false

	server.on('error', (error: NodeJS.ErrnoException) => {
		if (error.code === 'EADDRINUSE') {
			if (portRetried) {
				console.error(`Port ${port} is still in use after retry, exiting.`)
				process.exit(1)
			}

			portRetried = true
			console.warn(`Port ${port} is in use, attempting to free it...`)

			try {
				const cmd =
					process.platform === 'darwin'
						? `lsof -i :${port} | grep LISTEN | awk '{print $2}' | xargs kill -9`
						: `fuser -k ${port}/tcp`
				execSync(cmd, { stdio: 'ignore' })
			} catch {
				// Process may have already exited
			}

			server.listen(port)
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

		await onShutdown?.()

		console.log(`${name} shut down after ${signal}`)
		process.exit(0)
	}

	for (const signal of ['SIGINT', 'SIGTERM'] as const) {
		process.once(signal, () => {
			void shutdown(signal).catch((error) => {
				console.error(`Failed to shut down ${name} cleanly after ${signal}`, error)

				process.exit(1)
			})
		})
	}
}
