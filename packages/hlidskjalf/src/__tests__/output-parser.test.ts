import { isNoiseLine, parseLine, stripAnsi } from '../lib/output-parser.js'

describe('parseLine', () => {
	it('detects server ready with URL', () => {
		const result = parseLine('Bifrost running on http://localhost:3000')

		expect(result.status).toBe('ready')
		expect(result.url).toBe('http://localhost:3000')
	})

	it('detects listening with URL', () => {
		const result = parseLine('Server listening on http://localhost:3001')

		expect(result.status).toBe('ready')
		expect(result.url).toBe('http://localhost:3001')
	})

	it('detects build success', () => {
		const result = parseLine('⚡ Build success in 120ms')

		expect(result.status).toBe('watching')
		expect(result.url).toBeUndefined()
	})

	it('detects build start', () => {
		const result = parseLine('Build start')

		expect(result.status).toBe('building')
	})

	it('detects watching', () => {
		const result = parseLine('Watching for changes...')

		expect(result.status).toBe('watching')
	})

	it('detects errors', () => {
		const result = parseLine('TypeError: Cannot read property of undefined')

		expect(result.status).toBe('error')
	})

	it('returns empty for unrecognized lines', () => {
		const result = parseLine('some random log output')

		expect(result.status).toBeUndefined()
		expect(result.url).toBeUndefined()
	})
})

describe('isNoiseLine', () => {
	it('identifies DTS lines as noise', () => {
		expect(isNoiseLine('DTS Build start')).toBe(true)
	})

	it('identifies empty lines as noise', () => {
		expect(isNoiseLine('')).toBe(true)
		expect(isNoiseLine('   ')).toBe(true)
	})

	it('does not flag regular output', () => {
		expect(isNoiseLine('Server started')).toBe(false)
	})
})

describe('stripAnsi', () => {
	it('removes ANSI escape codes', () => {
		expect(stripAnsi('\x1b[32mgreen\x1b[0m')).toBe('green')
	})

	it('handles strings without ANSI codes', () => {
		expect(stripAnsi('plain text')).toBe('plain text')
	})
})
