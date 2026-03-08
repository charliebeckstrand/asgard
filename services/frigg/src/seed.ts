import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv } from './lib/env.js'

const env = loadEnv()
const seedPath = resolve(import.meta.dirname, '..', '..', '..', 'environments.json')

let rawData: Record<string, Record<string, string>>

try {
	rawData = JSON.parse(readFileSync(seedPath, 'utf-8'))
} catch {
	console.error(`Could not read seed file at ${seedPath}`)
	process.exit(1)
}

const defaults = rawData.$defaults ?? {}
const seedData = Object.fromEntries(
	Object.entries(rawData)
		.filter(([key]) => !key.startsWith('$'))
		.map(([key, data]) => [key, { ...defaults, ...data }]),
)

const baseUrl = `http://localhost:${env.PORT}`
const headers: Record<string, string> = { 'Content-Type': 'application/json' }

if (env.FRIGG_API_KEY) {
	headers['X-API-Key'] = env.FRIGG_API_KEY
}

let success = 0
let skipped = 0
let failed = 0

for (const [namespace, data] of Object.entries(seedData)) {
	try {
		// Fetch existing keys so we only seed what's missing
		const getRes = await fetch(`${baseUrl}/frigg/environment/${namespace}`, { headers })

		let existing: Record<string, string> = {}

		if (getRes.ok) {
			const body = (await getRes.json()) as { data: Record<string, string> }
			existing = body.data
		}

		// Filter to only new keys
		const newKeys: Record<string, string> = {}

		for (const [key, value] of Object.entries(data)) {
			if (!(key in existing)) {
				newKeys[key] = value
			}
		}

		if (Object.keys(newKeys).length === 0) {
			console.log(`  skipped ${namespace} (all ${Object.keys(data).length} keys exist)`)
			skipped++
			continue
		}

		const res = await fetch(`${baseUrl}/frigg/environment/${namespace}`, {
			method: 'PUT',
			headers,
			body: JSON.stringify(newKeys),
		})

		if (res.ok) {
			const skippedCount = Object.keys(data).length - Object.keys(newKeys).length
			const msg =
				skippedCount > 0
					? `  seeded ${namespace} (${Object.keys(newKeys).length} new, ${skippedCount} existing)`
					: `  seeded ${namespace} (${Object.keys(newKeys).length} keys)`
			console.log(msg)
			success++
		} else {
			console.error(`  failed ${namespace}: ${res.status} ${res.statusText}`)
			failed++
		}
	} catch (err) {
		console.error(`  failed ${namespace}: ${err instanceof Error ? err.message : err}`)
		failed++
	}
}

console.log(`\nDone: ${success} seeded, ${skipped} skipped, ${failed} failed`)

if (failed > 0) process.exit(1)
