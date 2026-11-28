import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { errorHandler, notFoundHandler } from '../../http/error-handler.js'
import type { RequestLoggerEnv } from '../../http/request-logger.js'

const logger = { error: vi.fn() }

const app = new Hono<RequestLoggerEnv>()

app.use(async (c, next) => {
	c.set('logger', logger as never)

	await next()
})

app.get('/error-with-status', () => {
	const err = new Error('Upstream said no') as Error & { status: number }

	err.status = 403

	throw err
})

app.get('/http-exception', () => {
	throw new HTTPException(422, { message: 'Validation failed' })
})

class CodedError extends HTTPException {
	readonly code = 'second_step_required'
}

app.get('/error-with-code', () => {
	throw new CodedError(403, { message: 'Confirm it is you' })
})

app.get('/http-exception-with-response', () => {
	throw new HTTPException(401, {
		res: new Response('Unauthorized', {
			headers: { 'WWW-Authenticate': 'Bearer realm=""' },
		}),
	})
})

const cause = new Error('connection refused')

app.get('/unavailable', () => {
	throw new HTTPException(503, { message: 'Down', cause })
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
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('hides the message of an error that only carries a status', async () => {
		const res = await app.request('/error-with-status')

		expect(res.status).toBe(500)

		const body = (await res.json()) as ErrorResponse

		expect(body.message).toBe('An unexpected error occurred')
	})

	it('returns structured JSON for HTTPException instances', async () => {
		const res = await app.request('/http-exception')

		expect(res.status).toBe(422)

		const body = (await res.json()) as ErrorResponse

		expect(body.error).toBe('Unprocessable Entity')

		expect(body.message).toBe('Validation failed')

		expect(body.statusCode).toBe(422)
	})

	it('names the error with its code when it has one', async () => {
		const res = await app.request('/error-with-code')

		expect(res.status).toBe(403)

		expect(await res.json()).toEqual({
			error: 'Forbidden',
			message: 'Confirm it is you',
			statusCode: 403,
			code: 'second_step_required',
		})
	})

	it("keeps the headers of an exception's response and names an empty message", async () => {
		const res = await app.request('/http-exception-with-response')

		expect(res.status).toBe(401)

		expect(res.headers.get('WWW-Authenticate')).toBe('Bearer realm=""')

		expect(res.headers.get('Content-Type')).toBe('application/json')

		expect(await res.json()).toEqual({
			error: 'Unauthorized',
			message: 'Unauthorized',
			statusCode: 401,
		})
	})

	it('logs an HTTPException of 500 or more with its cause', async () => {
		const res = await app.request('/unavailable')

		expect(res.status).toBe(503)

		expect(logger.error).toHaveBeenCalledWith(
			{ err: expect.objectContaining({ message: 'Down', cause }) },
			'request failed',
		)
	})

	it('logs an unexpected error through the request logger', async () => {
		const res = await app.request('/unexpected-error')

		expect(res.status).toBe(500)

		expect(logger.error).toHaveBeenCalledWith(
			{ err: expect.objectContaining({ message: 'Something broke' }) },
			'unhandled error',
		)
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
