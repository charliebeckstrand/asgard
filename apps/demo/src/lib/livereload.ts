import { watch } from 'node:fs'
import { join } from 'node:path'
import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

export function setupLivereload(app: Hono): void {
	const clients = new Set<() => void>()

	app.get('/__livereload', (c) => {
		return streamSSE(c, async (stream) => {
			const notify = () => stream.writeSSE({ data: 'reload' })

			clients.add(notify)

			stream.onAbort(() => {
				clients.delete(notify)
			})

			// Keep connection alive
			while (true) {
				await stream.sleep(30000)
			}
		})
	})

	const notify = () => {
		for (const client of clients) {
			client()
		}
	}

	// Watch src/ for ts, tsx, css changes
	const srcDir = join(process.cwd(), 'src')
	const distDir = join(process.cwd(), 'dist')

	for (const dir of [srcDir, distDir]) {
		watch(dir, { recursive: true }, (_event, filename) => {
			if (!filename) return

			if (/\.(ts|tsx|css)$/.test(filename)) {
				notify()
			}
		})
	}
}
