export const openApiConfig = {
	openapi: '3.0.0',
	info: {
		title: 'Saga',
		version: '0.1.0',
		description: 'Event bus microservice for inter-service messaging',
	},
	servers: [
		{
			url: 'http://localhost:3001',
			description: 'Local development',
		},
	],
}
