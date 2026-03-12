import { parseLine, stripAnsi } from '../lib/output-parser.js'

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

	it('detects build success with variation selector (⚡️)', () => {
		const result = parseLine('ESM ⚡️ Build success in 14ms')

		expect(result.status).toBe('watching')
	})

	it('detects build start', () => {
		const result = parseLine('Build start')

		expect(result.status).toBe('building')
	})

	it('ignores DTS Build start', () => {
		const result = parseLine('DTS Build start')

		expect(result.status).toBeUndefined()
	})

	it('ignores DTS Build success', () => {
		const result = parseLine('DTS ⚡️ Build success in 953ms')

		expect(result.status).toBeUndefined()
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

describe('stripAnsi', () => {
	it('removes ANSI escape codes', () => {
		expect(stripAnsi('\x1b[32mgreen\x1b[0m')).toBe('green')
	})

	it('handles strings without ANSI codes', () => {
		expect(stripAnsi('plain text')).toBe('plain text')
	})
})
