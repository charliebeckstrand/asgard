import { Hono } from 'hono'
import { errorHandler, notFoundHandler } from '../errors.js'

const app = new Hono()

app.get('/error-with-status', () => {
	const err = new Error('Forbidden') as Error & { status: number }

	err.status = 403
	err.name = 'ForbiddenError'

	throw err
})

app.get('/unexpected-error', () => {
	throw new Error('Something broke')
})

app.onError(errorHandler)
app.notFound(notFoundHandler)

type ErrorResponse = {
	error: string
	message: string
	statusCode: number
}

describe('errorHandler', () => {
	it('returns structured JSON for errors with status property', async () => {
		const res = await app.request('/error-with-status')

		expect(res.status).toBe(403)

		const body = (await res.json()) as ErrorResponse

		expect(body.error).toBe('ForbiddenError')
		expect(body.message).toBe('Forbidden')
		expect(body.statusCode).toBe(403)
	})

	it('returns 500 with generic message for unexpected errors', async () => {
		const res = await app.request('/unexpected-error')

		expect(res.status).toBe(500)

		const body = (await res.json()) as ErrorResponse

		expect(body.error).toBe('Internal Server Error')
		expect(body.message).toBe('An unexpected error occurred')
		expect(body.statusCode).toBe(500)
	})
})

describe('notFoundHandler', () => {
	it('returns 404 with method and path in message', async () => {
		const res = await app.request('/does-not-exist')

		expect(res.status).toBe(404)

		const body = (await res.json()) as ErrorResponse

		expect(body.error).toBe('Not Found')
		expect(body.message).toContain('GET')
		expect(body.message).toContain('/does-not-exist')
		expect(body.statusCode).toBe(404)
	})
})
