import { EventEmitter } from 'node:events'
import type { SecurityEvent } from 'skuld'

export const eventEmitter = new EventEmitter()

export function emitEvent(event: SecurityEvent): void {
	eventEmitter.emit('event', event)
}
