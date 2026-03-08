export const openApiConfig = {
	openapi: '3.0.0',
	info: {
		title: 'Frigg — The Config Oracle',
		version: '1.0.0',
		description:
			'The All-Mother sees all. Frigg validates the entire system for correctness — detecting port conflicts, broken cross-service references, and missing values.',
	},
	servers: [
		{
			url: 'http://localhost:3003',
			description: 'Local development',
		},
	],
}
