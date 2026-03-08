import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv } from './lib/env.js'

const env = loadEnv()
const seedPath = resolve(import.meta.dirname, '..', 'env.seed.json')

let seedData: Record<string, Record<string, string>>

try {
	seedData = JSON.parse(readFileSync(seedPath, 'utf-8'))
} catch {
	console.error(`Could not read seed file at ${seedPath}`)
	process.exit(1)
}

const baseUrl = `http://localhost:${env.PORT}`
const headers: Record<string, string> = { 'Content-Type': 'application/json' }

if (env.FRIGG_API_KEY) {
	headers['X-API-Key'] = env.FRIGG_API_KEY
}

let success = 0
let failed = 0

for (const [namespace, data] of Object.entries(seedData)) {
	try {
		const res = await fetch(`${baseUrl}/frigg/config/${namespace}`, {
			method: 'PUT',
			headers,
			body: JSON.stringify(data),
		})

		if (res.ok) {
			console.log(`  seeded ${namespace} (${Object.keys(data).length} keys)`)
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

console.log(`\nDone: ${success} seeded, ${failed} failed`)

if (failed > 0) process.exit(1)
