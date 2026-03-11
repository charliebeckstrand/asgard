import { getManifestPort } from './environment.js'

function resolvePort(): number {
	if (process.env.PORT) return Number(process.env.PORT)

	return getManifestPort()
}

export function createOpenApiConfig(info: { title: string; description: string }) {
	return {
		openapi: '3.0.0' as const,
		info: { ...info, version: '0.1.0' },
		servers: [
			{
				url: `http://localhost:${resolvePort()}`,
				description: 'Local development',
			},
		],
	}
}
