import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { errorHandler, notFoundHandler } from '../../http/error-handler.js'

const app = new Hono()

app.get('/error-with-status', () => {
	const err = new Error('Forbidden') as Error & { status: number }

	err.status = 403

	throw err
})

app.get('/http-exception', () => {
	throw new HTTPException(422, { message: 'Validation failed' })
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

		expect(body.error).toBe('Forbidden')

		expect(body.message).toBe('Forbidden')

		expect(body.statusCode).toBe(403)
	})

	it('returns structured JSON for HTTPException instances', async () => {
		const res = await app.request('/http-exception')

		expect(res.status).toBe(422)

		const body = (await res.json()) as ErrorResponse

		expect(body.error).toBe('Unprocessable Entity')

		expect(body.message).toBe('Validation failed')

		expect(body.statusCode).toBe(422)
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

	it('includes correct method in not found message', async () => {
		const res = await app.request('/missing', { method: 'POST' })

		const body = (await res.json()) as ErrorResponse

		expect(body.message).toContain('POST')
	})
})
