import { EventEmitter } from 'node:events'
import { createMessageId, getEmitter } from '@/lib/emitter'

describe('getEmitter', () => {
	it('returns an EventEmitter instance', () => {
		const emitter = getEmitter()

		expect(emitter).toBeInstanceOf(EventEmitter)
	})

	it('returns the same instance on repeated calls', () => {
		const first = getEmitter()
		const second = getEmitter()

		expect(first).toBe(second)
	})

	it('has maxListeners set to 100', () => {
		const emitter = getEmitter()

		expect(emitter.getMaxListeners()).toBe(100)
	})
})

describe('createMessageId', () => {
	it('returns string starting with msg_', () => {
		const id = createMessageId()

		expect(id).toMatch(/^msg_/)
	})

	it('returns unique IDs on successive calls', () => {
		const id1 = createMessageId()
		const id2 = createMessageId()

		expect(id1).not.toBe(id2)
	})

	it('includes timestamp component', () => {
		const before = Date.now()

		const id = createMessageId()

		const after = Date.now()

		const parts = id.split('_')
		const timestamp = Number(parts[1])

		expect(timestamp).toBeGreaterThanOrEqual(before)
		expect(timestamp).toBeLessThanOrEqual(after)
	})
})
