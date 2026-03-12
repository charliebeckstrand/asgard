import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { createProcessManager } from './lib/process-manager.js'
import { createRenderer, renderLoading } from './lib/renderer.js'
import type { DashboardOptions, SortOrder } from './lib/types.js'
import {
	discoverWorkspaces,
	filterWorkspaces,
	sortAlphabetically,
	sortByDependencyOrder,
} from './lib/workspace.js'

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

		child.on('error', (err) => {
			console.warn(`Docker compose failed to start: ${err.message}`)

			resolve(async () => {})
		})
	})
}

function parseArgs(argv: string[]): DashboardOptions {
	const root = process.cwd()

	const docker = !argv.includes('--no-docker')

	const filter: string[] = []
	let order: SortOrder = 'alphabetical'

	for (const arg of argv) {
		if (arg.startsWith('--filter=')) {
			// Strip curly braces — pnpm/turbo use {name} syntax
			const value = arg.slice('--filter='.length).replace(/^\{(.+)\}$/, '$1')

			filter.push(value)
		}

		if (arg.startsWith('--order=')) {
			const value = arg.slice('--order='.length)

			if (value === 'run' || value === 'alphabetical') {
				order = value
			}
		}
	}

	return { root, docker, filter: filter.length > 0 ? filter : undefined, order }
}

async function createDashboard(options: DashboardOptions): Promise<void> {
	let dockerCleanup: (() => Promise<void>) | undefined

	// Start Docker if requested
	if (options.docker) {
		renderLoading('Starting Docker containers...')

		dockerCleanup = await startDocker(options.root)
	}

	// Discover workspaces
	renderLoading('Discovering workspaces...')

	let entries = discoverWorkspaces(options.root)

	// Apply filter if provided
	if (options.filter) {
		entries = filterWorkspaces(entries, options.filter)
	}

	if (entries.length === 0) {
		console.error('No matching workspaces found.')

		process.exit(1)
	}

	// Sort for startup (always dependency order — packages must build first)
	const startupEntries = sortByDependencyOrder(entries)

	// Sort for display
	const sortEntries = options.order === 'run' ? sortByDependencyOrder : sortAlphabetically

	// Create process manager and renderer
	const manager = createProcessManager(options.root)

	const renderer = createRenderer()

	let selectedIndex = 0

	let shuttingDown = false

	const shutdown = async () => {
		if (shuttingDown) return

		shuttingDown = true

		renderer.cleanup()

		await manager.shutdown()

		if (dockerCleanup) {
			await dockerCleanup()
		}

		process.exit(0)
	}

	// Render on every process update
	const doRender = () => {
		const displayOrder = sortEntries(manager.getAll().map((p) => p.entry))
		const processes = displayOrder.flatMap((entry) => {
			const info = manager.get(entry.name)

			return info ? [info] : []
		})

		renderer.render({ processes, selectedIndex })
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
			await shutdown()
		}
	})

	// Handle signals
	process.on('SIGINT', shutdown)
	process.on('SIGTERM', shutdown)

	// Handle terminal resize
	process.stdout.on('resize', doRender)

	// Start all processes (renders progress as they start)
	doRender()

	manager.startAll(startupEntries)
}

// CLI entry point
const options = parseArgs(process.argv.slice(2))

createDashboard(options)
