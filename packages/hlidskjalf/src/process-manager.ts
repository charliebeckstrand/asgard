import { type ChildProcess, spawn } from 'node:child_process'
import { EventEmitter, on } from 'node:events'

import { parseLine, stripAnsi } from './output-parser.js'
import type { ProcessInfo, ProcessStatus, WorkspaceEntry } from './types.js'

const MAX_LOG_LINES = 500

export interface ProcessManagerEvents {
	update: [name: string, info: ProcessInfo]
	'all-ready': []
}

export interface ProcessManager extends EventEmitter<ProcessManagerEvents> {
	getAll(): ProcessInfo[]
	get(name: string): ProcessInfo | undefined
	startAll(entries: WorkspaceEntry[]): Promise<void>
	shutdown(): Promise<void>
}

class ProcessManagerImpl extends EventEmitter<ProcessManagerEvents> {
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
		const runnables = entries.filter((e) => e.type === 'service' || e.type === 'app')

		for (const entry of entries) {
			this.infos.set(entry.name, { entry, status: 'pending', logs: [] })
		}

		for (const entry of packages) {
			this.spawnProcess(entry)
		}

		if (packages.length > 0) {
			await this.waitForPackages(packages)
		}

		for (const entry of runnables) {
			await this.runEnvInit(entry)

			this.spawnProcess(entry)
		}
	}

	private async waitForPackages(packages: WorkspaceEntry[]): Promise<void> {
		const names = new Set(packages.map((p) => p.name))

		const isDone = () =>
			[...names].every((name) => {
				const status = this.infos.get(name)?.status

				return status === 'watching' || status === 'error'
			})

		if (isDone()) return

		for await (const _ of on(this, 'update')) {
			if (isDone()) break
		}
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
			for (const rawLine of data.toString().split('\n')) {
				const line = rawLine.trimEnd()

				if (!line) continue

				this.processLine(entry.name, line)
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

	private processLine(name: string, line: string): void {
		const info = this.infos.get(name)

		if (!info) return

		info.logs.push(line)

		if (info.logs.length > MAX_LOG_LINES) {
			info.logs.splice(0, info.logs.length - MAX_LOG_LINES)
		}

		const parsed = parseLine(stripAnsi(line))

		if (parsed.status) {
			info.status = parsed.status
		}

		if (parsed.url) {
			info.url = parsed.url
		}

		this.emit('update', name, info)
	}

	private updateStatus(name: string, status: ProcessStatus): void {
		const info = this.infos.get(name)

		if (!info) return

		info.status = status

		this.emit('update', name, info)

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
	return new ProcessManagerImpl(root)
}
