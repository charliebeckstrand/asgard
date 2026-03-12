export function createOpenApiConfig(info: { title: string; description: string; port: number }) {
	return {
		openapi: '3.0.0' as const,
		info: { ...info, version: '0.1.0' },
		servers: [
			{
				url: `http://localhost:${info.port}`,
				description: 'Local development',
			},
		],
	}
}
