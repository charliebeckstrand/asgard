import pc from 'picocolors'

import { stripAnsi } from './output-parser.js'
import type { ProcessInfo, ProcessStatus, WorkspaceType } from './types.js'

const ESC = '\x1b'
const CLEAR_SCREEN = `${ESC}[2J`
const CURSOR_HOME = `${ESC}[H`
const CURSOR_HIDE = `${ESC}[?25l`
const CURSOR_SHOW = `${ESC}[?25h`

const typeLabels: Record<WorkspaceType, string> = { package: 'pkg', service: 'svc', app: 'app' }

const statusStyles: Record<ProcessStatus, { color: (s: string) => string; label: string }> = {
	pending: { color: pc.gray, label: 'pending' },
	building: { color: pc.yellow, label: 'build' },
	watching: { color: pc.green, label: 'watch' },
	ready: { color: pc.green, label: 'ready' },
	error: { color: pc.red, label: 'error' },
	stopped: { color: pc.gray, label: 'stop' },
}

export interface RendererState {
	processes: ProcessInfo[]
	selectedIndex: number
}

type InputKey = 'up' | 'down' | 'quit'
type InputCallback = (key: InputKey) => void

export interface Renderer {
	render(state: RendererState): void
	onInput(callback: InputCallback): void
	cleanup(): void
}

// --- Layout helpers ---

function pad(str: string, len: number): string {
	return str + ' '.repeat(Math.max(0, len - str.length))
}

function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str

	return `${str.slice(0, maxLen - 1)}…`
}

// --- Frame builders ---

function renderHeader(cols: number, allReady: boolean): string[] {
	const icon = allReady ? pc.yellow('⚡') : pc.gray('◦')
	const title = `${icon} ${pc.bold('Asgard')}`
	const hints = '↑/↓ select  q quit'
	const titleLen = 1 + stripAnsi(title).length
	const remaining = cols - titleLen

	const header =
		remaining >= hints.length + 2
			? ` ${title}${' '.repeat(remaining - hints.length)}${pc.dim(hints)}`
			: ` ${title}`

	return [header, pc.dim('─'.repeat(cols))]
}

function renderTable(processes: ProcessInfo[], selectedIndex: number, nameWidth: number): string[] {
	const header = ` ${pc.dim(pc.bold(`${pad('Name', nameWidth)}${pad('Type', 6)}${pad('Status', 12)}URL`))}`

	const rows = processes.map((proc, i) => {
		const selected = i === selectedIndex
		const { color, label } = statusStyles[proc.status]
		const name = proc.entry.name
		const type = typeLabels[proc.entry.type]

		return [
			selected ? pc.cyan(`▸${pad(name, nameWidth)}`) : ` ${pad(name, nameWidth)}`,
			pc.dim(pad(type, 6)),
			color(`● ${pad(label, 10)}`),
			pc.dim(proc.url ?? ''),
		].join('')
	})

	return [header, ...rows]
}

function renderLogs(selected: ProcessInfo | undefined, logHeight: number, cols: number): string[] {
	if (!selected) return []

	const lines: string[] = [` ${pc.bold(`Logs: ${selected.entry.name}`)}`]

	const visible = selected.logs.slice(-logHeight)

	for (const line of visible) {
		lines.push(` ${truncate(line, cols - 2)}`)
	}

	// Fill remaining space
	for (let i = visible.length; i < logHeight; i++) {
		lines.push('')
	}

	return lines
}

// --- Input handling ---

function listenForKeys(callback: InputCallback): void {
	if (!process.stdin.isTTY) return

	process.stdin.setRawMode(true)
	process.stdin.resume()
	process.stdin.setEncoding('utf-8')

	process.stdin.on('data', (data: string) => {
		if (data === '\x03' || data === 'q') return callback('quit')
		if (data === `${ESC}[A` || data === 'k') return callback('up')
		if (data === `${ESC}[B` || data === 'j') return callback('down')
	})
}

// --- Public API ---

export function renderLoading(message: string = 'Starting...'): void {
	const cols = process.stdout.columns || 80

	process.stdout.write(CURSOR_HIDE + CURSOR_HOME + CLEAR_SCREEN)
	process.stdout.write(` ${pc.gray('◦')} ${pc.bold('Asgard')}\n`)
	process.stdout.write(`${pc.dim('─'.repeat(cols))}\n`)
	process.stdout.write(`\n ${pc.dim(message)}\n`)
}

export function createRenderer(): Renderer {
	return {
		render(state: RendererState): void {
			const { processes, selectedIndex } = state
			const cols = process.stdout.columns || 80
			const rows = process.stdout.rows || 24

			const allReady = processes.every((p) => p.status === 'ready' || p.status === 'watching')

			const nameWidth = Math.max(10, ...processes.map((p) => p.entry.name.length + 2))

			const header = renderHeader(cols, allReady)
			const table = renderTable(processes, selectedIndex, nameWidth)
			const divider = [pc.dim('─'.repeat(cols))]

			const usedRows = header.length + table.length + divider.length + 1
			const logHeight = Math.max(3, rows - usedRows - 1)
			const logs = renderLogs(processes[selectedIndex], logHeight, cols)

			const frame = [...header, ...table, ...divider, ...logs]

			process.stdout.write(CURSOR_HIDE + CURSOR_HOME + CLEAR_SCREEN + frame.join('\n'))
		},

		onInput(callback: InputCallback): void {
			listenForKeys(callback)
		},

		cleanup(): void {
			process.stdout.write(CURSOR_SHOW)

			if (process.stdin.isTTY) {
				process.stdin.setRawMode(false)
				process.stdin.pause()
			}
		},
	}
}
