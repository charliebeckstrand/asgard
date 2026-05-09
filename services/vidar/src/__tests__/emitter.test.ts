import type { SecurityEvent } from 'skuld'
import { emitEvent, eventEmitter } from '@/lib/emitter'

describe('emitEvent', () => {
	it('emits events on the eventEmitter', () => {
		const handler = vi.fn()

		eventEmitter.on('event', handler)

		const event: SecurityEvent = {
			id: 'evt-1',
			ip: '10.0.0.1',
			event_type: 'login_failed',
			details: { email: 'test@example.com' },
			service: 'bifrost',
			created_at: '2024-01-01T00:00:00Z',
		}

		emitEvent(event)

		expect(handler).toHaveBeenCalledOnce()

		expect(handler).toHaveBeenCalledWith(event)

		eventEmitter.off('event', handler)
	})
})
