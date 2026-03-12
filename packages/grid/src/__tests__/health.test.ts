import { createHealthRoute } from '../health.js'

type HealthResponse = {
	status: string
	version: string
	uptime: number
}

describe('createHealthRoute', () => {
	it('returns 200 with healthy status', async () => {
		const app = createHealthRoute()

		const res = await app.request('/health')

		expect(res.status).toBe(200)

		const body = (await res.json()) as HealthResponse

		expect(body.status).toBe('healthy')
		expect(body.version).toBe('0.1.0')
		expect(body.uptime).toBeTypeOf('number')
		expect(body.uptime).toBeGreaterThanOrEqual(0)
	})

	it('includes extra fields from custom check function', async () => {
		const app = createHealthRoute({
			check: async () => ({ db_latency_ms: 5, subscribers: 42 }),
		})

		const res = await app.request('/health')

		const body = (await res.json()) as HealthResponse & {
			db_latency_ms: number
			subscribers: number
		}

		expect(body.status).toBe('healthy')
		expect(body.db_latency_ms).toBe(5)
		expect(body.subscribers).toBe(42)
	})

	it('accepts custom description', async () => {
		const app = createHealthRoute({ description: 'Custom health check' })

		const res = await app.request('/health')

		expect(res.status).toBe(200)
	})
})
