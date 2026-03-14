import { z } from 'zod'
import { getManifestPort } from './manifest.js'

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
