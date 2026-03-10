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

function getBaseSchema() {
	return z.object({
		PORT: z.coerce.number().default(() => getManifestPort()),
		NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	})
}

type BaseEnv = z.infer<ReturnType<typeof getBaseSchema>>

export function createEnvironment(): () => BaseEnv

export function createEnvironment<T extends z.ZodRawShape>(
	extra: T,
): () => BaseEnv & z.infer<z.ZodObject<T>>

export function createEnvironment<T extends z.ZodRawShape>(extra?: T) {
	const baseSchema = getBaseSchema()

	const schema = extra ? baseSchema.extend(extra) : baseSchema

	let cached: z.infer<typeof schema> | null = null

	return function environment() {
		if (cached) return cached

		// Treat empty strings as undefined so optional() fields work correctly
		// (e.g. DigitalOcean sets unresolved secrets to "" instead of leaving them unset)
		const env = Object.fromEntries(Object.entries(process.env).filter(([_, v]) => v !== ''))

		const result = schema.safeParse(env)

		if (!result.success) {
			console.error('Invalid environment variables:', result.error.format())

			process.exit(1)
		}

		cached = result.data

		return cached
	}
}
