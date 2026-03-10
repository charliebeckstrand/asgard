import { EventEmitter } from 'node:events'

export interface VidarEvent {
	id: string
	ip: string
	event_type: string
	details: Record<string, unknown>
	service: string
	created_at: string
}

export const eventEmitter = new EventEmitter()

export function emitEvent(event: VidarEvent): void {
	eventEmitter.emit('event', event)
}
