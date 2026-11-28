#!/usr/bin/env tsx
import { parseArgs } from 'node:util'
import { syncEnv } from '../env/sync.js'

// `--rotate` alone makes every secret again; `--rotate NAME…` only those.
const { values, positionals } = parseArgs({
	options: {
		rotate: { type: 'boolean' },
		services: { type: 'string' },
	},
	allowPositionals: true,
})

if (positionals.length > 0 && !values.rotate) {
	throw new Error(`Secret names only go with --rotate: ${positionals.join(' ')}`)
}

const rotate = values.rotate ? (positionals.length > 0 ? positionals : true) : undefined

const result = syncEnv({ rotate, services: values.services?.split(',') })

for (const key of result.rotated) console.log(`rotated ${key}`)
for (const key of result.generated) console.log(`generated ${key}`)
for (const name of result.written) console.log(`wrote ${name}/.env`)
