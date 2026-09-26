import { createDb } from 'saga'
import { environment } from './env.js'
import { logger } from './log.js'

export const db = createDb(() => {
	const env = environment()

	return { url: env.DATABASE_URL, ca: env.DATABASE_CA_CERT, logger: logger() }
})
