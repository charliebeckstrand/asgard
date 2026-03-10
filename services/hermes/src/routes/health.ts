import { createHealthRoute } from 'grid'
import { getChannels, getSubscriberCount } from '../lib/channels.js'

export const health = createHealthRoute({
	description: 'Returns the health status of the messaging service',
	check: async () => ({
		connections: getSubscriberCount(),
		channels: getChannels().length,
	}),
})
