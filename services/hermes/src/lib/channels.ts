import type { WSContext } from 'hono/ws'

const channels = new Map<string, Set<WSContext>>()
const clientChannels = new Map<WSContext, Set<string>>()

export function subscribe(channel: string, ws: WSContext) {
	if (!channels.has(channel)) {
		channels.set(channel, new Set())
	}
	channels.get(channel)?.add(ws)

	if (!clientChannels.has(ws)) {
		clientChannels.set(ws, new Set())
	}
	clientChannels.get(ws)?.add(channel)
}

export function unsubscribe(channel: string, ws: WSContext) {
	channels.get(channel)?.delete(ws)
	if (channels.get(channel)?.size === 0) {
		channels.delete(channel)
	}

	clientChannels.get(ws)?.delete(channel)
	if (clientChannels.get(ws)?.size === 0) {
		clientChannels.delete(ws)
	}
}

export function removeClient(ws: WSContext) {
	const subs = clientChannels.get(ws)
	if (subs) {
		for (const channel of subs) {
			channels.get(channel)?.delete(ws)
			if (channels.get(channel)?.size === 0) {
				channels.delete(channel)
			}
		}
		clientChannels.delete(ws)
	}
}

export function send(channel: string, data: Record<string, unknown>, source?: string): number {
	const subscribers = channels.get(channel)
	if (!subscribers || subscribers.size === 0) return 0

	const message = JSON.stringify({
		channel,
		data,
		source: source ?? null,
		timestamp: new Date().toISOString(),
	})

	let sent = 0
	for (const ws of subscribers) {
		try {
			ws.send(message)
			sent++
		} catch {
			// Client disconnected, will be cleaned up on close
		}
	}

	return sent
}

export function broadcast(data: Record<string, unknown>, source?: string): number {
	const seen = new Set<WSContext>()
	const message = JSON.stringify({
		channel: '*',
		data,
		source: source ?? null,
		timestamp: new Date().toISOString(),
	})

	let sent = 0
	for (const subscribers of channels.values()) {
		for (const ws of subscribers) {
			if (seen.has(ws)) continue
			seen.add(ws)
			try {
				ws.send(message)
				sent++
			} catch {
				// Client disconnected
			}
		}
	}

	return sent
}

export function getChannels(): Array<{ channel: string; subscribers: number }> {
	const result: Array<{ channel: string; subscribers: number }> = []
	for (const [channel, subscribers] of channels) {
		result.push({ channel, subscribers: subscribers.size })
	}
	return result
}

export function getSubscriberCount(): number {
	return clientChannels.size
}

export function reset() {
	channels.clear()
	clientChannels.clear()
}
