import { parseArgs } from 'node:util'

import { startDocker } from './docker.js'
import { createProcessManager } from './process-manager.js'
import { createRenderer, renderLoading } from './renderer.js'
import type { DashboardOptions, SortOrder } from './types.js'
import {
	discoverWorkspaces,
	filterWorkspaces,
	sortAlphabetically,
	sortByDependencyOrder,
} from './workspace.js'

function parseCli(argv: string[]): DashboardOptions {
	const { values } = parseArgs({
		args: argv,
		options: {
			'no-docker': { type: 'boolean', default: false },
			filter: { type: 'string', multiple: true },
			order: { type: 'string', default: 'alphabetical' },
		},
	})

	const filter = values.filter?.map((f) => f.replace(/^\{(.+)\}$/, '$1'))

	return {
		root: process.cwd(),
		docker: !values['no-docker'],
		filter: filter?.length ? filter : undefined,
		order: (values.order === 'run' ? 'run' : 'alphabetical') as SortOrder,
	}
}

async function createDashboard(options: DashboardOptions): Promise<void> {
	let dockerCleanup: (() => Promise<void>) | undefined

	if (options.docker) {
		renderLoading('Starting Docker containers...')

		dockerCleanup = await startDocker(options.root)
	}

	renderLoading('Discovering workspaces...')

	let entries = discoverWorkspaces(options.root)

	if (options.filter) {
		entries = filterWorkspaces(entries, options.filter)
	}

	if (entries.length === 0) {
		console.error('No matching workspaces found.')

		process.exit(1)
	}

	const startupEntries = sortByDependencyOrder(entries)
	const sortEntries = options.order === 'run' ? sortByDependencyOrder : sortAlphabetically

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

	const render = () => {
		const displayOrder = sortEntries(manager.getAll().map((p) => p.entry))
		const processes = displayOrder.flatMap((entry) => {
			const info = manager.get(entry.name)

			return info ? [info] : []
		})

		renderer.render({ processes, selectedIndex })
	}

	manager.on('update', render)

	renderer.onInput(async (key) => {
		const count = manager.getAll().length

		if (key === 'up') {
			selectedIndex = Math.max(0, selectedIndex - 1)

			render()
		} else if (key === 'down') {
			selectedIndex = Math.min(count - 1, selectedIndex + 1)

			render()
		} else if (key === 'quit') {
			await shutdown()
		}
	})

	process.on('SIGINT', shutdown)
	process.on('SIGTERM', shutdown)
	process.stdout.on('resize', render)

	render()

	manager.startAll(startupEntries)
}

const options = parseCli(process.argv.slice(2))

createDashboard(options)
