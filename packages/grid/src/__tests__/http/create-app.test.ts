import { createApp } from '../../http/create-app.js'

describe('createApp', () => {
	it('returns a configured app', () => {
		const app = createApp({
			basePath: '/test',
			title: 'Test Service',
			description: 'A test service',
			port: 4000,
		})

		expect(app).toBeDefined()
	})

	it('serves the base path with service info', async () => {
		const app = createApp({
			basePath: '/test',
			title: 'Test Service',
			description: 'A test service',
			port: 4000,
		})

		const res = await app.request('/test')

		expect(res.status).toBe(200)

		const body = (await res.json()) as {
			service: string
			openApi: string
			docs: string
		}

		expect(body.service).toBe('test service')
		expect(body.openApi).toBe('/test/openapi.json')
		expect(body.docs).toBe('/test/docs')
	})

	it('serves OpenAPI JSON at basePath/openapi.json', async () => {
		const app = createApp({
			basePath: '/api',
			title: 'API',
			description: 'Main API',
			port: 4000,
		})

		const res = await app.request('/api/openapi.json')

		expect(res.status).toBe(200)

		const body = (await res.json()) as { openapi: string; info: { title: string } }

		expect(body.openapi).toBe('3.0.0')
		expect(body.info.title).toBe('API')
	})

	it('handles errors using errorHandler', async () => {
		const app = createApp({
			basePath: '/test',
			title: 'Test',
			description: '',
			port: 4000,
		})

		app.get('/test/boom', () => {
			throw new Error('Boom')
		})

		const res = await app.request('/test/boom')

		expect(res.status).toBe(500)

		const body = (await res.json()) as { error: string }

		expect(body.error).toBe('Internal Server Error')
	})

	it('returns 404 for unknown routes', async () => {
		const app = createApp({
			basePath: '/test',
			title: 'Test',
			description: '',
			port: 4000,
		})

		const res = await app.request('/test/nonexistent')

		expect(res.status).toBe(404)

		const body = (await res.json()) as { error: string }

		expect(body.error).toBe('Not Found')
	})
})
