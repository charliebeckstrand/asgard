import type { EnvironmentData, Issue, ManifestData } from './types.js'

function getStatus(issues: Issue[]): 'pass' | 'warn' | 'fail' {
	if (issues.some((i) => i.level === 'error')) return 'fail'
	if (issues.some((i) => i.level === 'warning')) return 'warn'

	return 'pass'
}

/**
 * Check for port conflicts across all services.
 */
export function checkPortConflicts(
	allServices: EnvironmentData,
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

/**
 * Validate a single service's resolved environment.
 */
export function validateService(
	name: string,
	data: Record<string, string>,
	allServices: EnvironmentData,
	manifests: ManifestData,
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

		const refName = key.replace(/_URL$/, '').toLowerCase()

		const refService = allServices[refName]

		if (!refService) continue

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

	// Check API key consistency
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
	const manifest = manifests[name]

	if (manifest) {
		for (const varName of Object.keys(manifest.vars)) {
			if (data[varName] === undefined) {
				issues.push({
					level: 'error',
					message: `${varName} declared in manifest but missing from config`,
				})
			}
		}

		for (const [varName, config] of Object.entries(manifest.vars)) {
			if (config.type !== 'ref' || !config.service) continue

			const refManifest = manifests[config.service]

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

/**
 * Validate all services, including port conflict checks.
 */
export function validateAll(
	environments: EnvironmentData,
	manifests: ManifestData,
): { service: string; status: 'pass' | 'warn' | 'fail'; issues: Issue[] }[] {
	const portConflicts = checkPortConflicts(environments)

	return Object.entries(environments).map(([name, data]) => {
		const issues = validateService(name, data, environments, manifests)

		const conflicts = portConflicts.find((pc) => pc.service === name)

		if (conflicts) {
			issues.push(...conflicts.issues)
		}

		return { service: name, status: getStatus(issues), issues }
	})
}
