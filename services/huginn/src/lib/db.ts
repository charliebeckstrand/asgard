import { createDb, createLazyPool } from 'mimir'
import { loadEnv } from './env.js'

const { getPool, closePool } = createLazyPool(
	() => {
		const url = loadEnv().DATABASE_URL

		if (!url) throw new Error('DATABASE_URL is not configured')

		return url
	},
	{ max: 10 },
)

const getDb = () => createDb(getPool())

export { closePool, getDb, getPool }
