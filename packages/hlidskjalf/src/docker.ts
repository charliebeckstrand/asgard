import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

type Cleanup = () => Promise<void>

const noop: Cleanup = async () => {}

export async function startDocker(root: string): Promise<Cleanup> {
	const composePath = join(root, 'docker-compose.dev.yml')

	if (!existsSync(composePath)) return noop

	return new Promise((resolve) => {
		const child = spawn('docker', ['compose', '-f', composePath, 'up', '-d', '--wait'], {
			cwd: root,
			stdio: 'pipe',
		})

		child.on('close', () => {
			resolve(async () => {
				const down = spawn('docker', ['compose', '-f', composePath, 'down'], {
					cwd: root,
					stdio: 'pipe',
				})

				await new Promise<void>((r) => down.on('close', () => r()))
			})
		})

		child.on('error', (err) => {
			console.warn(`Docker compose failed to start: ${err.message}`)

			resolve(noop)
		})
	})
}
