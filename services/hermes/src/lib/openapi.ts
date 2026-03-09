export const openApiConfig = {
	openapi: '3.0.0',
	info: {
		title: 'Hermes',
		version: '0.1.0',
		description: 'Stateless multi-channel messaging relay with real-time event streaming',
	},
	servers: [
		{
			url: 'http://localhost:3004',
			description: 'Local development',
		},
	],
}
