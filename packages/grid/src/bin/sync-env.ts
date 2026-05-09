#!/usr/bin/env tsx
import { syncEnv } from '../env/sync.js'

const args = process.argv.slice(2)

const rotateFlag = args.find((a) => a.startsWith('--rotate'))
const servicesFlag = args.find((a) => a.startsWith('--services='))

const rotateMatch = rotateFlag?.match(/^--rotate(?:=(.+))?$/)

const rotate: true | string[] | undefined = rotateMatch
	? rotateMatch[1]
		? rotateMatch[1].split(',')
		: true
	: undefined

const services = servicesFlag?.match(/^--services=(.+)$/)?.[1].split(',')

const result = syncEnv({ rotate, services })

for (const key of result.rotated) console.log(`rotated ${key}`)
for (const key of result.generated) console.log(`generated ${key}`)
for (const name of result.written) console.log(`wrote ${name}/.env`)
