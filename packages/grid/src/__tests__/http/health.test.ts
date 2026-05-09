import { createHealthRoute } from '../../http/health.js'

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

	describe('with services probes', () => {
		type HealthWithServices = HealthResponse & {
			services: Record<string, { status: 'up' | 'down' | 'unknown'; latency?: number }>
		}

		it('returns 200 healthy when all probes are up', async () => {
			const app = createHealthRoute({
				services: {
					database: async () => ({ up: true }),
					cache: async () => ({ up: true }),
				},
			})

			const res = await app.request('/health')

			expect(res.status).toBe(200)

			const body = (await res.json()) as HealthWithServices

			expect(body.status).toBe('healthy')
			expect(body.services.database.status).toBe('up')
			expect(body.services.cache.status).toBe('up')
		})

		it('returns 200 degraded when some probes are down', async () => {
			const app = createHealthRoute({
				services: {
					database: async () => ({ up: true }),
					cache: async () => ({ up: false }),
				},
			})

			const res = await app.request('/health')

			expect(res.status).toBe(200)

			const body = (await res.json()) as HealthWithServices

			expect(body.status).toBe('degraded')
		})

		it('returns 503 unhealthy when all probes are down', async () => {
			const app = createHealthRoute({
				services: {
					database: async () => ({ up: false }),
				},
			})

			const res = await app.request('/health')

			expect(res.status).toBe(503)

			const body = (await res.json()) as HealthWithServices

			expect(body.status).toBe('unhealthy')
		})

		it('treats a thrown probe as down', async () => {
			const app = createHealthRoute({
				services: {
					database: async () => {
						throw new Error('connection refused')
					},
				},
			})

			const res = await app.request('/health')

			expect(res.status).toBe(503)

			const body = (await res.json()) as HealthWithServices

			expect(body.services.database.status).toBe('down')
		})
	})
})
