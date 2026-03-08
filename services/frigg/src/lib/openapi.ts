export const openApiConfig = {
	openapi: '3.0.0',
	info: {
		title: 'Frigg Secrets & Config Service',
		version: '0.1.0',
		description:
			'Hosted, encrypted .env files. Centralizes config, manages secrets, and distributes environment-specific settings.',
	},
	servers: [
		{
			url: 'http://localhost:3003',
			description: 'Local development',
		},
	],
}
