import { getManifestPort } from './env.js'

export const openApiConfig = {
	openapi: '3.0.0',
	info: {
		title: 'Heimdall',
		version: '0.1.0',
		description: 'JWT authentication microservice',
	},
	servers: [
		{
			url: `http://localhost:${getManifestPort()}`,
			description: 'Local development',
		},
	],
}
