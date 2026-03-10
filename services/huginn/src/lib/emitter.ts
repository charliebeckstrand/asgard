import { EventEmitter } from 'node:events'

export interface HuginnEvent {
	id: string
	topic: string
	payload: Record<string, unknown>
	source: string
	created_at: string
}

export const eventEmitter = new EventEmitter()

export function emitEvent(event: HuginnEvent): void {
	eventEmitter.emit('event', event)
}
