import { getManifestPort } from './environment.js'

export function createOpenApiConfig(info: { title: string; description: string }) {
	const port = process.env.PORT ? Number(process.env.PORT) : getManifestPort()

	return {
		openapi: '3.0.0' as const,
		info: { ...info, version: '0.1.0' },
		servers: [
			{
				url: `http://localhost:${port}`,
				description: 'Local development',
			},
		],
	}
}
