import { createApp } from '../app.js'

describe('createApp', () => {
	it('returns an app and setup function', () => {
		const { app, setup } = createApp({
			basePath: '/test',
			title: 'Test Service',
			description: 'A test service',
			port: 3000,
		})

		expect(app).toBeDefined()
		expect(setup).toBeTypeOf('function')
	})

	it('serves the base path with service info after setup', async () => {
		const { app, setup } = createApp({
			basePath: '/test',
			title: 'Test Service',
			description: 'A test service',
			port: 3000,
		})

		setup()

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
		const { app, setup } = createApp({
			basePath: '/api',
			title: 'API',
			description: 'Main API',
			port: 3000,
		})

		setup()

		const res = await app.request('/api/openapi.json')

		expect(res.status).toBe(200)

		const body = (await res.json()) as { openapi: string; info: { title: string } }

		expect(body.openapi).toBe('3.0.0')
		expect(body.info.title).toBe('API')
	})

	it('handles errors using errorHandler after setup', async () => {
		const { app, setup } = createApp({
			basePath: '/test',
			title: 'Test',
			description: '',
			port: 3000,
		})

		app.get('/test/boom', () => {
			throw new Error('Boom')
		})

		setup()

		const res = await app.request('/test/boom')

		expect(res.status).toBe(500)

		const body = (await res.json()) as { error: string }

		expect(body.error).toBe('Internal Server Error')
	})

	it('returns 404 for unknown routes after setup', async () => {
		const { app, setup } = createApp({
			basePath: '/test',
			title: 'Test',
			description: '',
			port: 3000,
		})

		setup()

		const res = await app.request('/test/nonexistent')

		expect(res.status).toBe(404)

		const body = (await res.json()) as { error: string }

		expect(body.error).toBe('Not Found')
	})
})
