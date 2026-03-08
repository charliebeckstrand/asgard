import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv } from './env.js'

export type EnvironmentData = Record<string, Record<string, string>>

let cached: EnvironmentData | null = null

function getEnvironmentPath(): string {
	const env = loadEnv()
	const filename = `${env.NODE_ENV}.json`

	return resolve(import.meta.dirname, '..', '..', '..', '..', 'environments', filename)
}

export function loadEnvironments(): EnvironmentData {
	if (cached) return cached

	const envPath = getEnvironmentPath()

	let raw: Record<string, Record<string, string>>

	try {
		raw = JSON.parse(readFileSync(envPath, 'utf-8'))
	} catch {
		throw new Error(`Could not read environment file at ${envPath}`)
	}

	const defaults = raw.$defaults ?? {}

	cached = Object.fromEntries(
		Object.entries(raw)
			.filter(([key]) => !key.startsWith('$'))
			.map(([key, data]) => [key, { ...defaults, ...data }]),
	)

	return cached
}

export function getServiceConfig(service: string): Record<string, string> | null {
	const environments = loadEnvironments()

	return environments[service] ?? null
}

export function getServiceNames(): string[] {
	const environments = loadEnvironments()

	return Object.keys(environments)
}

export function clearCache(): void {
	cached = null
}
