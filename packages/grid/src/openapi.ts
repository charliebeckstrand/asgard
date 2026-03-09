import { getManifestPort } from 'frigg'

export function createOpenApiConfig(info: { title: string; description: string }) {
	return {
		openapi: '3.0.0' as const,
		info: { ...info, version: '0.1.0' },
		servers: [
			{
				url: `http://localhost:${getManifestPort()}`,
				description: 'Local development',
			},
		],
	}
}
