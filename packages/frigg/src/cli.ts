import { resolve } from 'node:path'
import { initEnvironments } from './pipeline.js'

const args = process.argv.slice(2)

const rotateFlag = args.find((a) => a.startsWith('--rotate'))
const servicesFlag = args.find((a) => a.startsWith('--services='))

let rotate: true | string[] | undefined

if (rotateFlag) {
	const match = rotateFlag.match(/^--rotate=(.+)$/)

	rotate = match ? match[1].split(',') : true
}

const services = servicesFlag?.match(/^--services=(.+)$/)?.[1].split(',')

const rootDir = resolve(import.meta.dirname, '..', '..', '..')

initEnvironments({ rootDir, rotate, services })
