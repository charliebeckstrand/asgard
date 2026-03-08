export const openApiConfig = {
	openapi: '3.0.0',
	info: {
		title: 'Frigg Environment Management Service',
		version: '0.2.0',
		description:
			'Hosted, encrypted environment management. Centralizes secret storage with AES-256-GCM encryption at rest, namespace-based organization, and single-step rollback.',
	},
	servers: [
		{
			url: 'http://localhost:3003',
			description: 'Local development',
		},
	],
}
