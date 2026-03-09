import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getServiceConfig, getServiceNames, loadEnvironments } from '../lib/environments.js'
import { getManifest, loadManifests } from '../lib/manifests.js'
import {
	ErrorSchema,
	ValidateResponseSchema,
	ValidateServiceResponseSchema,
} from '../lib/schemas.js'
import { apiKeyAuth } from '../middleware/api-key.js'

interface Issue {
	level: 'error' | 'warning'
	message: string
}

function validateService(
	name: string,
	data: Record<string, string>,
	allServices: Record<string, Record<string, string>>,
): Issue[] {
	const issues: Issue[] = []

	// Check for empty values
	for (const [key, value] of Object.entries(data)) {
		if (value === '') {
			issues.push({ level: 'error', message: `${key} is empty` })
		}
	}

	// Validate PORT is a number
	if (data.PORT !== undefined) {
		const port = Number(data.PORT)

		if (Number.isNaN(port) || port < 1 || port > 65535) {
			issues.push({ level: 'error', message: `PORT '${data.PORT}' is not a valid port number` })
		}
	} else {
		issues.push({ level: 'warning', message: 'No PORT configured' })
	}

	// Validate URL-shaped keys
	for (const [key, value] of Object.entries(data)) {
		if (!key.endsWith('_URL')) continue

		try {
			new URL(value)
		} catch {
			issues.push({ level: 'error', message: `${key} '${value}' is not a valid URL` })
		}
	}

	// Check cross-service references
	for (const [key, value] of Object.entries(data)) {
		if (!key.endsWith('_URL')) continue

		// Extract referenced service name from key (e.g., HEIMDALL_URL -> heimdall)
		const refName = key.replace(/_URL$/, '').toLowerCase()

		const refService = allServices[refName]

		if (!refService) continue

		// Verify the URL port matches the referenced service's PORT
		try {
			const url = new URL(value)

			const urlPort = url.port || (url.protocol === 'https:' ? '443' : '80')

			if (refService.PORT && urlPort !== refService.PORT) {
				issues.push({
					level: 'error',
					message: `${key} port :${urlPort} does not match ${refName}'s PORT ${refService.PORT}`,
				})
			}
		} catch {
			// Already reported as invalid URL above
		}
	}

	// Check API key consistency (e.g., bifrost's HEIMDALL_API_KEY should match heimdall's)
	for (const [key, value] of Object.entries(data)) {
		if (!key.endsWith('_API_KEY')) continue

		const refName = key.replace(/_API_KEY$/, '').toLowerCase()

		const refService = allServices[refName]

		if (!refService) continue

		const refKey = `${key.replace(/_API_KEY$/, '').toUpperCase()}_API_KEY`

		if (refService[refKey] && refService[refKey] !== value) {
			issues.push({
				level: 'error',
				message: `${key} does not match ${refName}'s ${refKey}`,
			})
		}
	}

	// Manifest-aware checks
	const manifest = getManifest(name)

	if (manifest) {
		// Check all declared vars are present
		for (const varName of Object.keys(manifest.vars)) {
			if (data[varName] === undefined) {
				issues.push({
					level: 'error',
					message: `${varName} declared in manifest but missing from config`,
				})
			}
		}

		// Check ref targets exist
		for (const [varName, config] of Object.entries(manifest.vars)) {
			if (config.type !== 'ref' || !config.service) continue

			const refManifest = loadManifests()[config.service]

			if (!refManifest) {
				issues.push({
					level: 'error',
					message: `${varName} references service '${config.service}' which has no manifest`,
				})
				continue
			}

			if (config.key && !refManifest.vars[config.key]) {
				issues.push({
					level: 'error',
					message: `${varName} references '${config.service}.${config.key}' which is not declared in ${config.service}'s manifest`,
				})
			}
		}
	} else {
		issues.push({ level: 'warning', message: 'No manifest.json found for this service' })
	}

	return issues
}

function getStatus(issues: Issue[]): 'pass' | 'warn' | 'fail' {
	if (issues.some((i) => i.level === 'error')) return 'fail'
	if (issues.some((i) => i.level === 'warning')) return 'warn'

	return 'pass'
}

function checkPortConflicts(
	allServices: Record<string, Record<string, string>>,
): { service: string; issues: Issue[] }[] {
	const portMap = new Map<string, string[]>()

	for (const [name, data] of Object.entries(allServices)) {
		if (!data.PORT) continue

		const existing = portMap.get(data.PORT) ?? []

		existing.push(name)

		portMap.set(data.PORT, existing)
	}

	const results: { service: string; issues: Issue[] }[] = []

	for (const [port, services] of portMap) {
		if (services.length <= 1) continue

		for (const service of services) {
			results.push({
				service,
				issues: [
					{
						level: 'error',
						message: `PORT ${port} conflicts with: ${services.filter((s) => s !== service).join(', ')}`,
					},
				],
			})
		}
	}

	return results
}

const ServiceParam = z.object({
	service: z.string().min(1).openapi({ description: 'Service name', example: 'heimdall' }),
})

const validateAllRoute = createRoute({
	method: 'get',
	path: '/validate',
	tags: ['Validation'],
	summary: 'Validate all service configs',
	description:
		'The Oracle inspects every service configuration — checking for empty values, port conflicts, invalid URLs, cross-service reference mismatches, and manifest consistency.',
	security: [{ ApiKey: [] }],
	responses: {
		200: {
			content: { 'application/json': { schema: ValidateResponseSchema } },
			description: 'Validation results',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
	},
})

const validateServiceRoute = createRoute({
	method: 'get',
	path: '/validate/{service}',
	tags: ['Validation'],
	summary: 'Validate a single service config',
	description: 'Validates a specific service configuration against the full system context.',
	security: [{ ApiKey: [] }],
	request: { params: ServiceParam },
	responses: {
		200: {
			content: { 'application/json': { schema: ValidateServiceResponseSchema } },
			description: 'Validation result',
		},
		401: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Unauthorized',
		},
		404: {
			content: { 'application/json': { schema: ErrorSchema } },
			description: 'Service not found',
		},
	},
})

export const validate = new OpenAPIHono()

validate.use('/validate/*', apiKeyAuth())
validate.use('/validate', apiKeyAuth())

validate.openapi(validateAllRoute, (c) => {
	const allServices = loadEnvironments()

	const portConflicts = checkPortConflicts(allServices)

	const serviceResults = getServiceNames().map((name) => {
		const data = allServices[name]

		const issues = validateService(name, data, allServices)

		// Merge port conflict issues
		const conflicts = portConflicts.find((pc) => pc.service === name)

		if (conflicts) {
			issues.push(...conflicts.issues)
		}

		return { service: name, status: getStatus(issues), issues }
	})

	const allIssues = serviceResults.flatMap((r) => r.issues)

	return c.json({ status: getStatus(allIssues), services: serviceResults }, 200)
})

validate.openapi(validateServiceRoute, (c) => {
	const { service } = c.req.valid('param')

	const data = getServiceConfig(service)

	if (!data) {
		return c.json(
			{
				error: 'Not Found',
				message: `No configuration found for service '${service}'`,
				statusCode: 404,
			},
			404,
		)
	}

	const allServices = loadEnvironments()

	const issues = validateService(service, data, allServices)

	// Check port conflicts for this service
	const portConflicts = checkPortConflicts(allServices)

	const conflicts = portConflicts.find((pc) => pc.service === service)

	if (conflicts) {
		issues.push(...conflicts.issues)
	}

	return c.json({ service, status: getStatus(issues), issues }, 200)
})
