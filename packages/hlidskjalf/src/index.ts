import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { createProcessManager } from './lib/process-manager.js'
import { createRenderer } from './lib/renderer.js'
import type { DashboardOptions } from './lib/types.js'
import { discoverWorkspaces, filterWorkspaces, sortByDependencyOrder } from './lib/workspace.js'

async function startDocker(root: string): Promise<() => Promise<void>> {
	const composePath = join(root, 'docker-compose.dev.yml')

	if (!existsSync(composePath)) {
		return async () => {}
	}

	return new Promise((resolve) => {
		const child = spawn('docker', ['compose', '-f', composePath, 'up', '-d', '--wait'], {
			cwd: root,
			stdio: 'pipe',
		})

		child.on('close', () => {
			const cleanup = async () => {
				const down = spawn('docker', ['compose', '-f', composePath, 'down'], {
					cwd: root,
					stdio: 'pipe',
				})

				await new Promise<void>((r) => down.on('close', () => r()))
			}

			resolve(cleanup)
		})

		child.on('error', () => {
			resolve(async () => {})
		})
	})
}

function parseArgs(argv: string[]): DashboardOptions {
	const root = process.cwd()
	const docker = !argv.includes('--no-docker')
	const filter: string[] = []

	for (const arg of argv) {
		if (arg.startsWith('--filter=')) {
			filter.push(arg.slice('--filter='.length))
		}
	}

	return { root, docker, filter: filter.length > 0 ? filter : undefined }
}

async function createDashboard(options: DashboardOptions): Promise<void> {
	let dockerCleanup: (() => Promise<void>) | undefined

	// Start Docker if requested
	if (options.docker) {
		dockerCleanup = await startDocker(options.root)
	}

	// Discover and sort workspaces
	let entries = sortByDependencyOrder(discoverWorkspaces(options.root))

	// Apply filter if provided
	if (options.filter) {
		entries = filterWorkspaces(entries, options.filter)
		entries = sortByDependencyOrder(entries)
	}

	if (entries.length === 0) {
		console.error('No matching workspaces found.')

		process.exit(1)
	}

	// Create process manager and renderer
	const manager = createProcessManager(options.root)
	const renderer = createRenderer()
	let selectedIndex = 0
	let shuttingDown = false

	// Render on every process update
	const doRender = () => {
		renderer.render({
			processes: manager.getAll(),
			selectedIndex,
		})
	}

	manager.on('update', doRender)

	// Handle keyboard input
	renderer.onInput(async (key) => {
		const processCount = manager.getAll().length

		if (key === 'up') {
			selectedIndex = Math.max(0, selectedIndex - 1)

			doRender()
		} else if (key === 'down') {
			selectedIndex = Math.min(processCount - 1, selectedIndex + 1)

			doRender()
		} else if (key === 'quit') {
			if (shuttingDown) return

			shuttingDown = true

			renderer.cleanup()

			await manager.shutdown()

			if (dockerCleanup) {
				await dockerCleanup()
			}

			process.exit(0)
		}
	})

	// Handle signals
	const handleSignal = async () => {
		if (shuttingDown) return

		shuttingDown = true

		renderer.cleanup()

		await manager.shutdown()

		if (dockerCleanup) {
			await dockerCleanup()
		}

		process.exit(0)
	}

	process.on('SIGINT', handleSignal)
	process.on('SIGTERM', handleSignal)

	// Handle terminal resize
	process.stdout.on('resize', doRender)

	// Start all processes (renders progress as they start)
	doRender()

	manager.startAll(entries)
}

// CLI entry point
const options = parseArgs(process.argv.slice(2))

createDashboard(options)
