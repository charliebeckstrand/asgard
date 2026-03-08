import type { createNodeWebSocket } from '@hono/node-ws'
import { getSubscriberCount, removeClient, subscribe, unsubscribe } from '../lib/channels.js'

const MAX_CONNECTIONS = 5

export function createWsHandler(getConnectFn: () => ReturnType<typeof createNodeWebSocket>) {
	return () => {
		const { upgradeWebSocket } = getConnectFn()

		return upgradeWebSocket((c) => ({
			onOpen(_event, ws) {
				if (getSubscriberCount() >= MAX_CONNECTIONS) {
					ws.send(
						JSON.stringify({
							error: 'Connection limit reached',
							message: `Maximum of ${MAX_CONNECTIONS} concurrent connections allowed`,
						}),
					)
					ws.close(1013, 'Connection limit reached')
					return
				}

				const channel = c.req.query('channel')
				if (channel) {
					subscribe(channel, ws)
					ws.send(
						JSON.stringify({
							type: 'subscribed',
							channel,
							timestamp: new Date().toISOString(),
						}),
					)
				}

				console.log(`WebSocket connected (${getSubscriberCount()} total)`)
			},

			onMessage(event, ws) {
				try {
					const msg = JSON.parse(typeof event.data === 'string' ? event.data : '')

					if (msg.type === 'subscribe' && typeof msg.channel === 'string') {
						subscribe(msg.channel, ws)
						ws.send(
							JSON.stringify({
								type: 'subscribed',
								channel: msg.channel,
								timestamp: new Date().toISOString(),
							}),
						)
					} else if (msg.type === 'unsubscribe' && typeof msg.channel === 'string') {
						unsubscribe(msg.channel, ws)
						ws.send(
							JSON.stringify({
								type: 'unsubscribed',
								channel: msg.channel,
								timestamp: new Date().toISOString(),
							}),
						)
					}
				} catch {
					ws.send(JSON.stringify({ error: 'Invalid message format' }))
				}
			},

			onClose(_event, ws) {
				removeClient(ws)
				console.log(`WebSocket disconnected (${getSubscriberCount()} total)`)
			},

			onError(error) {
				console.error('WebSocket error:', error)
			},
		}))
	}
}
