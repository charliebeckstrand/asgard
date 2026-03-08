import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = resolve(root, 'environments.json')

let environments

try {
	environments = JSON.parse(readFileSync(envPath, 'utf-8'))
} catch {
	console.error(`Could not read ${envPath}`)
	process.exit(1)
}

const defaults = environments.$defaults || {}

for (const [namespace, data] of Object.entries(environments)) {
	if (namespace.startsWith('$')) continue

	const match = namespace.match(/^(.+)\.development$/)

	if (!match) continue

	const service = match[1]
	const serviceDir = resolve(root, 'services', service)

	if (!existsSync(serviceDir)) continue

	const dotenvPath = resolve(serviceDir, '.env')

	if (existsSync(dotenvPath)) continue

	const merged = { ...defaults, ...data }
	const content = Object.entries(merged)
		.map(([key, value]) => `${key}=${value}`)
		.join('\n')

	writeFileSync(dotenvPath, `${content}\n`)
	console.log(`  created ${service}/.env`)
}
