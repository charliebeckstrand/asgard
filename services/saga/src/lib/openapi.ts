import { getManifestPort } from './env.js'

export const openApiConfig = {
	openapi: '3.0.0',
	info: {
		title: 'Saga',
		version: '0.1.0',
		description: 'Centralized logging service for structured log ingestion and querying',
	},
	servers: [
		{
			url: `http://localhost:${getManifestPort()}`,
			description: 'Local development',
		},
	],
}
