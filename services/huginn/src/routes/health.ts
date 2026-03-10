import { createHealthRoute } from 'grid'

export const health = createHealthRoute({
	description: 'Returns the health status of the event bus',
})
