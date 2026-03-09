export const openApiConfig = {
	openapi: '3.0.0',
	info: {
		title: 'Frigg',
		version: '1.0.0',
		description:
			'Frigg validates the entire system for correctness — detecting port conflicts, broken cross-service references, and missing values.',
	},
	servers: [
		{
			url: 'http://localhost:3003',
			description: 'Local development',
		},
	],
}
