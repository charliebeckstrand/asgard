import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

export function getManifestPort(): number {
	let dir = process.cwd()

	while (!existsSync(resolve(dir, 'manifest.json'))) {
		const parent = resolve(dir, '..')

		if (parent === dir) throw new Error('manifest.json not found')

		dir = parent
	}

	const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf-8'))

	return manifest.port
}

const baseSchema = z.object({
	PORT: z.coerce.number().default(() => getManifestPort()),
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

type BaseSchema = typeof baseSchema

type BaseEnvironment = z.infer<BaseSchema>

export function createEnvironment(): () => BaseEnvironment

export function createEnvironment<T extends z.ZodRawShape>(
	extra: T,
): () => BaseEnvironment & z.infer<z.ZodObject<T>>

export function createEnvironment<T extends z.ZodRawShape>(extra?: T) {
	const schema = extra ? baseSchema.extend(extra) : baseSchema

	let cached: z.infer<typeof schema> | null = null

	return function environment() {
		if (cached) return cached

		// Treat empty strings as undefined so optional() fields work correctly
		// (e.g. DigitalOcean sets unresolved secrets to "" instead of leaving them unset)
		const env = Object.fromEntries(Object.entries(process.env).filter(([_, v]) => v !== ''))

		const result = schema.safeParse(env)

		if (!result.success) {
			console.error(`Invalid environment variables:\n${z.prettifyError(result.error)}`)

			process.exit(1)
		}

		cached = result.data

		return cached
	}
}
