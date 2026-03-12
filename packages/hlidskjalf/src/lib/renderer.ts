import type { ProcessInfo, ProcessStatus } from './types.js'

// ANSI escape codes
const ESC = '\x1b'
const CLEAR_SCREEN = `${ESC}[2J`
const CURSOR_HOME = `${ESC}[H`
const CURSOR_HIDE = `${ESC}[?25l`
const CURSOR_SHOW = `${ESC}[?25h`
const BOLD = `${ESC}[1m`
const DIM = `${ESC}[2m`
const RESET = `${ESC}[0m`

const FG = {
	red: `${ESC}[31m`,
	green: `${ESC}[32m`,
	yellow: `${ESC}[33m`,
	cyan: `${ESC}[36m`,
	gray: `${ESC}[90m`,
	white: `${ESC}[37m`,
} as const

const statusDisplay: Record<ProcessStatus, { color: string; label: string }> = {
	pending: { color: FG.gray, label: 'pending' },
	building: { color: FG.yellow, label: 'build' },
	watching: { color: FG.green, label: 'watch' },
	ready: { color: FG.green, label: 'ready' },
	error: { color: FG.red, label: 'error' },
	stopped: { color: FG.gray, label: 'stop' },
}

export interface RendererState {
	processes: ProcessInfo[]
	selectedIndex: number
}

type InputCallback = (key: 'up' | 'down' | 'quit') => void

export interface Renderer {
	render(state: RendererState): void
	onInput(callback: InputCallback): void
	cleanup(): void
}

function pad(str: string, len: number): string {
	return str + ' '.repeat(Math.max(0, len - str.length))
}

function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str

	return `${str.slice(0, maxLen - 1)}…`
}

export function renderLoading(message: string = 'Starting...'): void {
	const cols = process.stdout.columns || 80

	const write = (s: string) => process.stdout.write(s)

	write(CURSOR_HIDE + CURSOR_HOME + CLEAR_SCREEN)
	write(` ${FG.gray}◦${RESET} ${BOLD}Yggdrasil${RESET}\n`)
	write(`${DIM}${'─'.repeat(cols)}${RESET}\n`)
	write(`\n ${DIM}${message}${RESET}\n`)
}

export function createRenderer(): Renderer {
	const write = (s: string) => process.stdout.write(s)

	let inputCallback: InputCallback | null = null
	let stdinSetup = false

	function setupInput() {
		if (stdinSetup || !process.stdin.isTTY) return

		stdinSetup = true

		process.stdin.setRawMode(true)
		process.stdin.resume()
		process.stdin.setEncoding('utf-8')

		process.stdin.on('data', (data: string) => {
			if (!inputCallback) return

			// Ctrl+C
			if (data === '\x03') {
				inputCallback('quit')

				return
			}

			// q
			if (data === 'q') {
				inputCallback('quit')

				return
			}

			// Arrow up or k
			if (data === `${ESC}[A` || data === 'k') {
				inputCallback('up')

				return
			}

			// Arrow down or j
			if (data === `${ESC}[B` || data === 'j') {
				inputCallback('down')

				return
			}
		})
	}

	function renderFrame(state: RendererState): void {
		const { processes, selectedIndex } = state
		const cols = process.stdout.columns || 80
		const rows = process.stdout.rows || 24
		const lines: string[] = []

		// Header
		const allReady = processes.every((p) => p.status === 'ready' || p.status === 'watching')
		const icon = allReady ? `${FG.yellow}⚡${RESET}` : `${FG.gray}◦${RESET}`
		const title = `${icon} ${BOLD}Yggdrasil${RESET}`
		const hints = `${DIM}↑/↓ select  q quit${RESET}`
		const titlePad = Math.max(0, cols - 25 - 19)

		lines.push(` ${title}${' '.repeat(titlePad)}${hints}`)
		lines.push(`${DIM}${'─'.repeat(cols)}${RESET}`)

		// Table header
		const nameWidth = Math.max(10, ...processes.map((p) => p.entry.name.length + 2))

		lines.push(
			` ${DIM}${BOLD}${pad('Name', nameWidth)}${pad('Type', 6)}${pad('Status', 12)}URL${RESET}`,
		)

		// Table rows
		for (let i = 0; i < processes.length; i++) {
			const proc = processes[i]
			const isSelected = i === selectedIndex
			const status = statusDisplay[proc.status]
			const arrow = isSelected ? `${FG.cyan}▸${RESET}` : ' '
			const nameColor = isSelected ? `${FG.cyan}${BOLD}` : ''
			const nameReset = isSelected ? RESET : ''
			const typeLabel = proc.entry.type === 'service' ? 'svc' : 'pkg'

			lines.push(
				`${arrow}${nameColor}${pad(proc.entry.name, nameWidth)}${nameReset}` +
					`${DIM}${pad(typeLabel, 6)}${RESET}` +
					`${status.color}● ${pad(status.label, 10)}${RESET}` +
					`${DIM}${proc.url ?? ''}${RESET}`,
			)
		}

		lines.push(`${DIM}${'─'.repeat(cols)}${RESET}`)

		// Log panel
		const selected = processes[selectedIndex]
		const logHeaderHeight = 2
		const tableHeight = lines.length
		const logHeight = Math.max(3, rows - tableHeight - logHeaderHeight - 1)

		if (selected) {
			lines.push(` ${BOLD}Logs: ${selected.entry.name}${RESET}`)

			const logs = selected.logs
			const visibleLogs = logs.slice(-logHeight)

			for (const line of visibleLogs) {
				lines.push(` ${truncate(line, cols - 2)}`)
			}

			// Fill remaining space with empty lines
			const remaining = logHeight - visibleLogs.length

			for (let i = 0; i < remaining; i++) {
				lines.push('')
			}
		}

		write(CURSOR_HIDE + CURSOR_HOME + CLEAR_SCREEN)

		write(lines.join('\n'))
	}

	return {
		render(state: RendererState): void {
			renderFrame(state)
		},

		onInput(callback: InputCallback): void {
			inputCallback = callback

			setupInput()
		},

		cleanup(): void {
			write(CURSOR_SHOW)

			if (process.stdin.isTTY) {
				process.stdin.setRawMode(false)
				process.stdin.pause()
			}
		},
	}
}
