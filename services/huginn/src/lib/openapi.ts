import { getManifestPort } from './env.js'

export const openApiConfig = {
	openapi: '3.0.0',
	info: {
		title: 'Huginn',
		version: '0.1.0',
		description: 'Event bus microservice for inter-service messaging',
	},
	servers: [
		{
			url: `http://localhost:${getManifestPort()}`,
			description: 'Local development',
		},
	],
}
