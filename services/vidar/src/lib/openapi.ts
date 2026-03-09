import { getManifestPort } from './env.js'

export const openApiConfig = {
	openapi: '3.0.0',
	info: {
		title: 'Vidar',
		version: '0.1.0',
		description:
			'Security monitoring microservice for threat detection, IP ban enforcement, and optional AI-powered analysis',
	},
	servers: [
		{
			url: `http://localhost:${getManifestPort()}`,
			description: 'Local development',
		},
	],
}
