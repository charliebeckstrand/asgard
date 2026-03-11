import { hc } from 'hono/client'

import type { HermesApp } from './app.js'

export type { HermesApp }

export function createHermesClient(baseUrl = 'http://localhost:3001') {
	return hc<HermesApp>(baseUrl)
}
