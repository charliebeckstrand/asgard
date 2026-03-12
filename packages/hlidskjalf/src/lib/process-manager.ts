import { type ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'

import { parseLine, stripAnsi } from './output-parser.js'
import type { ProcessInfo, ProcessStatus, WorkspaceEntry } from './types.js'

const MAX_LOG_LINES = 500

export interface ProcessManagerEvents {
	update: [name: string, info: ProcessInfo]
	'all-ready': []
}

export class ProcessManager extends EventEmitter<ProcessManagerEvents> {
	private processes = new Map<string, ChildProcess>()
	private infos = new Map<string, ProcessInfo>()
	private root: string
	private shuttingDown = false

	constructor(root: string) {
		super()

		this.root = root
	}

	getAll(): ProcessInfo[] {
		return [...this.infos.values()]
	}

	get(name: string): ProcessInfo | undefined {
		return this.infos.get(name)
	}

	async startAll(entries: WorkspaceEntry[]): Promise<void> {
		const packages = entries.filter((e) => e.type === 'package')
		const services = entries.filter((e) => e.type === 'service')

		// Initialize all process infos
		for (const entry of entries) {
			this.infos.set(entry.name, {
				entry,
				status: 'pending',
				logs: [],
			})
		}

		// Start packages first
		for (const entry of packages) {
			this.spawnProcess(entry)
		}

		// Wait for packages to finish initial build, then start services
		if (packages.length > 0) {
			await this.waitForPackages(packages)
		}

		// Run env:init for services, then start them
		for (const entry of services) {
			await this.runEnvInit(entry)

			this.spawnProcess(entry)
		}
	}

	private async waitForPackages(packages: WorkspaceEntry[]): Promise<void> {
		const names = new Set(packages.map((p) => p.name))

		return new Promise((resolve) => {
			const check = () => {
				const allReady = [...names].every((name) => {
					const info = this.infos.get(name)

					return info?.status === 'watching' || info?.status === 'error'
				})

				if (allReady) {
					this.off('update', listener)

					resolve()
				}
			}

			const listener = () => check()

			this.on('update', listener)

			// Check immediately in case they're already done
			check()
		})
	}

	private async runEnvInit(entry: WorkspaceEntry): Promise<void> {
		return new Promise((resolve) => {
			const child = spawn('pnpm', ['--filter', entry.name, 'run', 'env:init'], {
				cwd: this.root,
				stdio: 'pipe',
				env: { ...process.env, FORCE_COLOR: '0' },
			})

			child.on('close', () => resolve())
			child.on('error', () => resolve())
		})
	}

	private spawnProcess(entry: WorkspaceEntry): void {
		const child = spawn('pnpm', ['--filter', entry.name, 'run', 'dev'], {
			cwd: this.root,
			stdio: 'pipe',
			env: { ...process.env, FORCE_COLOR: '1' },
		})

		this.processes.set(entry.name, child)

		this.updateStatus(entry.name, 'building')

		const handleOutput = (data: Buffer) => {
			const lines = data.toString().split('\n')

			for (const rawLine of lines) {
				const line = rawLine.trimEnd()

				if (!line) continue

				const info = this.infos.get(entry.name)

				if (!info) continue

				// Add to log buffer
				info.logs.push(line)

				if (info.logs.length > MAX_LOG_LINES) {
					info.logs.splice(0, info.logs.length - MAX_LOG_LINES)
				}

				// Parse for status changes
				const parsed = parseLine(stripAnsi(line))

				if (parsed.status) {
					this.updateStatus(entry.name, parsed.status)
				}

				if (parsed.url) {
					info.url = parsed.url
				}

				this.emit('update', entry.name, info)
			}
		}

		child.stdout?.on('data', handleOutput)
		child.stderr?.on('data', handleOutput)

		child.on('close', (code) => {
			if (!this.shuttingDown) {
				this.updateStatus(entry.name, code === 0 ? 'stopped' : 'error')
			}
		})

		child.on('error', () => {
			this.updateStatus(entry.name, 'error')
		})
	}

	private updateStatus(name: string, status: ProcessStatus): void {
		const info = this.infos.get(name)

		if (!info) return

		info.status = status

		this.emit('update', name, info)

		// Check if all processes are ready
		const allReady = [...this.infos.values()].every(
			(i) => i.status === 'ready' || i.status === 'watching',
		)

		if (allReady && this.infos.size > 0) {
			this.emit('all-ready')
		}
	}

	async shutdown(): Promise<void> {
		this.shuttingDown = true

		const promises: Promise<void>[] = []

		for (const [name, child] of this.processes) {
			promises.push(
				new Promise((resolve) => {
					child.on('close', () => {
						this.updateStatus(name, 'stopped')

						resolve()
					})

					child.kill('SIGTERM')

					// Force kill after 5s
					setTimeout(() => {
						if (!child.killed) {
							child.kill('SIGKILL')
						}
					}, 5000)
				}),
			)
		}

		await Promise.all(promises)
	}
}

export function createProcessManager(root: string): ProcessManager {
	return new ProcessManager(root)
}
