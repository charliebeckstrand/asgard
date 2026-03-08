export const openApiConfig = {
	openapi: '3.0.0',
	info: {
		title: 'Frigg Secrets Management Service',
		version: '0.1.0',
		description:
			'Hosted, encrypted secrets. Centralizes secret storage with AES-256-GCM encryption at rest and namespace-based organization.',
	},
	servers: [
		{
			url: 'http://localhost:3003',
			description: 'Local development',
		},
	],
}
