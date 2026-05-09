import { createHealthRoute } from 'grid'
import { getPool } from '../lib/db.js'

export const health = createHealthRoute({
	description: 'Returns the health status of the chat service and its database',
	services: {
		database: async () => {
			await getPool().query('SELECT 1')

			return { up: true }
		},
	},
})
