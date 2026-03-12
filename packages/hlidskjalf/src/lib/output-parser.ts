import type { ProcessStatus } from './types.js'

export interface ParseResult {
	status?: ProcessStatus
	url?: string
}

const patterns: Array<{
	regex: RegExp
	status: ProcessStatus
	extractUrl?: boolean
}> = [
	{ regex: /running on (https?:\/\/\S+)/, status: 'ready', extractUrl: true },
	{ regex: /listening on (https?:\/\/\S+)/, status: 'ready', extractUrl: true },
	{ regex: /started.*(https?:\/\/localhost:\d+)/, status: 'ready', extractUrl: true },
	{ regex: /⚡\s*Build success/, status: 'watching' },
	{ regex: /Build start/, status: 'building' },
	{ regex: /Watching for changes/, status: 'watching' },
	{ regex: /[Ee]rror[\s:]/, status: 'error' },
	{ regex: /process exit/, status: 'error' },
]

// Lines to filter out (noise from build tools)
const ignorePatterns: RegExp[] = [/^DTS\s/, /^DTS\s.*Build/, /^\s*$/]

export function parseLine(line: string): ParseResult {
	for (const { regex, status, extractUrl } of patterns) {
		const match = line.match(regex)

		if (match) {
			return {
				status,
				url: extractUrl ? match[1] : undefined,
			}
		}
	}

	return {}
}

export function isNoiseLine(line: string): boolean {
	return ignorePatterns.some((r) => r.test(line))
}

export function stripAnsi(text: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape codes requires matching control characters
	return text.replace(/\x1b\[[0-9;]*m/g, '')
}
