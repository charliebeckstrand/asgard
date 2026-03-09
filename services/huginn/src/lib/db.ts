import { createLazyPool } from 'mimir'
import { loadEnv } from './env.js'

const { getPool, closePool } = createLazyPool(
	() => {
		const url = loadEnv().DATABASE_URL

		if (!url) throw new Error('DATABASE_URL is not configured')

		return url
	},
	{ max: 10 },
)

export { closePool, getPool }
