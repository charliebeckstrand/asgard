import { createHealthRoute } from 'grid'
import { db } from '../lib/db.js'

export const health = createHealthRoute({
	description: 'Returns the health status of the gateway and its database',
	services: {
		database: async () => ({ up: await db.ping() }),
	},
})
