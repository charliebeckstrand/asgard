import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { loadEnvironments } from '../lib/environments.js'
import { getSecretConsumers, getSecretOwnership, loadManifests } from '../lib/manifests.js'
import { SecretsStatusResponseSchema } from '../lib/schemas.js'

const secretsStatusRoute = createRoute({
	method: 'get',
	path: '/secrets/status',
	tags: ['Secrets'],
	summary: 'Secrets health status',
	description:
		'Shows metadata about all managed secrets — ownership, consumers, and whether values are consistent across services. Does not expose actual secret values.',
	responses: {
		200: {
			content: { 'application/json': { schema: SecretsStatusResponseSchema } },
			description: 'Secrets status',
		},
	},
})

export const secrets = new OpenAPIHono()

secrets.openapi(secretsStatusRoute, (c) => {
	const ownership = getSecretOwnership()
	const consumers = getSecretConsumers()
	const allServices = loadEnvironments()
	const manifests = loadManifests()

	const secretsList = Object.entries(ownership).map(([key, owner]) => {
		const consumerList = consumers[key] ?? [owner]

		// Check consistency: all consumers should have the same value
		const values = new Set<string>()

		// Owner's value
		const ownerConfig = allServices[owner]
		if (ownerConfig?.[key]) {
			values.add(ownerConfig[key])
		}

		// Consumer values (via ref)
		for (const consumer of consumerList) {
			if (consumer === owner) continue

			const consumerConfig = allServices[consumer]

			if (!consumerConfig) continue

			// Find which var in the consumer's manifest references this key
			const manifest = manifests[consumer]

			if (!manifest) continue

			for (const [varName, config] of Object.entries(manifest.vars)) {
				if (config.type === 'ref' && config.key === key) {
					if (consumerConfig[varName]) {
						values.add(consumerConfig[varName])
					}
				}
			}
		}

		const consistent = values.size <= 1

		const generated = values.size > 0 && !Array.from(values).some((v) => v === '')

		return {
			key,
			owner,
			consumers: consumerList,
			consistent,
			generated,
		}
	})

	const allConsistent = secretsList.every((s) => s.consistent)
	const allGenerated = secretsList.every((s) => s.generated)

	return c.json(
		{
			status: allConsistent && allGenerated ? 'healthy' : 'unhealthy',
			secrets: secretsList,
		},
		200,
	)
})
