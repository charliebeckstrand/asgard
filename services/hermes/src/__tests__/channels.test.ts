import type { WSContext } from 'hono/ws'
import {
	broadcast,
	getChannels,
	getSubscriberCount,
	removeClient,
	reset,
	send,
	subscribe,
	unsubscribe,
} from '../lib/channels.js'

function createMockWs(): WSContext {
	const messages: string[] = []
	return {
		send: (data: string) => {
			messages.push(data)
		},
		close: () => {},
		readyState: 1,
		raw: null,
		url: null,
		protocol: '',
		_messages: messages,
	} as unknown as WSContext & { _messages: string[] }
}

describe('channels', () => {
	let ws1: WSContext & { _messages: string[] }
	let ws2: WSContext & { _messages: string[] }

	beforeEach(() => {
		reset()
		ws1 = createMockWs() as WSContext & { _messages: string[] }
		ws2 = createMockWs() as WSContext & { _messages: string[] }
	})

	describe('subscribe', () => {
		it('should add a client to a channel', () => {
			subscribe('test', ws1)
			const channels = getChannels()
			expect(channels).toEqual([{ channel: 'test', subscribers: 1 }])
		})

		it('should track multiple subscribers on a channel', () => {
			subscribe('test', ws1)
			subscribe('test', ws2)
			const channels = getChannels()
			expect(channels).toEqual([{ channel: 'test', subscribers: 2 }])
		})

		it('should track a client across multiple channels', () => {
			subscribe('a', ws1)
			subscribe('b', ws1)
			expect(getChannels()).toHaveLength(2)
			expect(getSubscriberCount()).toBe(1)
		})
	})

	describe('unsubscribe', () => {
		it('should remove a client from a channel', () => {
			subscribe('test', ws1)
			unsubscribe('test', ws1)
			expect(getChannels()).toEqual([])
		})

		it('should not affect other subscribers', () => {
			subscribe('test', ws1)
			subscribe('test', ws2)
			unsubscribe('test', ws1)
			expect(getChannels()).toEqual([{ channel: 'test', subscribers: 1 }])
		})
	})

	describe('removeClient', () => {
		it('should remove a client from all channels', () => {
			subscribe('a', ws1)
			subscribe('b', ws1)
			subscribe('a', ws2)
			removeClient(ws1)
			expect(getChannels()).toEqual([{ channel: 'a', subscribers: 1 }])
			expect(getSubscriberCount()).toBe(1)
		})
	})

	describe('send', () => {
		it('should send a message to channel subscribers', () => {
			subscribe('test', ws1)
			const sent = send('test', { hello: 'world' }, 'heimdall')
			expect(sent).toBe(1)
			expect(ws1._messages).toHaveLength(1)
			const parsed = JSON.parse(ws1._messages[0])
			expect(parsed.channel).toBe('test')
			expect(parsed.data).toEqual({ hello: 'world' })
			expect(parsed.source).toBe('heimdall')
		})

		it('should return 0 for empty channels', () => {
			const sent = send('nonexistent', { hello: 'world' })
			expect(sent).toBe(0)
		})
	})

	describe('broadcast', () => {
		it('should send to all connected clients', () => {
			subscribe('a', ws1)
			subscribe('b', ws2)
			const sent = broadcast({ alert: true })
			expect(sent).toBe(2)
			expect(ws1._messages).toHaveLength(1)
			expect(ws2._messages).toHaveLength(1)
		})

		it('should not send duplicate messages to a client on multiple channels', () => {
			subscribe('a', ws1)
			subscribe('b', ws1)
			const sent = broadcast({ alert: true })
			expect(sent).toBe(1)
			expect(ws1._messages).toHaveLength(1)
		})
	})
})
