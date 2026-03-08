import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { getChannels } from '../lib/channels.js'
import { ChannelListSchema } from '../lib/schemas.js'

const listChannelsRoute = createRoute({
	method: 'get',
	path: '/channels',
	tags: ['Channels'],
	summary: 'List active channels',
	description: 'Returns all active channels with their subscriber counts',
	responses: {
		200: {
			content: { 'application/json': { schema: ChannelListSchema } },
			description: 'List of active channels',
		},
	},
})

export const channels = new OpenAPIHono().openapi(listChannelsRoute, async (c) => {
	const data = getChannels()

	return c.json(
		{
			data,
			total: data.length,
		},
		200,
	)
})
