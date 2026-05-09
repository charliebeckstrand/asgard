#!/usr/bin/env tsx
import { syncEnv } from '../env/sync.js'

const args = process.argv.slice(2)

function readFlag(name: string): string | true | undefined {
	const flag = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))

	if (!flag) return undefined
	if (flag === `--${name}`) return true

	return flag.slice(name.length + 3)
}

const rotateValue = readFlag('rotate')
const servicesValue = readFlag('services')

const rotate: true | string[] | undefined = rotateValue === true ? true : rotateValue?.split(',')

const services = typeof servicesValue === 'string' ? servicesValue.split(',') : undefined

const result = syncEnv({ rotate, services })

for (const key of result.rotated) console.log(`rotated ${key}`)
for (const key of result.generated) console.log(`generated ${key}`)
for (const name of result.written) console.log(`wrote ${name}/.env`)
