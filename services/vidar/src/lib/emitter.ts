import { EventEmitter } from 'node:events'
import type { SecurityEvent } from 'skuld'

export const eventEmitter = new EventEmitter()

// Each open event stream adds a listener, so there is no fixed ceiling.
eventEmitter.setMaxListeners(0)

export function emitEvent(event: SecurityEvent): void {
	eventEmitter.emit('event', event)
}
