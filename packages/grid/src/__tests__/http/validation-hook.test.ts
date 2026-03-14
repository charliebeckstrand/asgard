import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { validationHook } from '../../http/validation-hook.js'

const app = new OpenAPIHono({ defaultHook: validationHook })

const route = createRoute({
	method: 'post',
	path: '/test',
	request: {
		body: {
			content: {
				'application/json': {
					schema: z.object({
						email: z.email('Invalid email address'),
						password: z.string().min(8, 'Password must be at least 8 characters'),
					}),
				},
			},
			required: true,
		},
	},
	responses: {
		200: {
			content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
			description: 'Success',
		},
	},
})

app.openapi(route, (c) => c.json({ ok: true }, 200))

type ErrorResponse = {
	error: string
	message: string
	statusCode: number
}

describe('validationHook', () => {
	it('returns human-readable error for a single validation failure', async () => {
		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: 'user@example.com', password: 'short' }),
		})

		expect(res.status).toBe(400)

		const body = (await res.json()) as ErrorResponse

		expect(body.error).toBe('Validation Error')
		expect(body.message).toContain('Password must be at least 8 characters')
		expect(body.statusCode).toBe(400)
	})

	it('returns combined messages for multiple validation failures', async () => {
		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: 'not-an-email', password: 'short' }),
		})

		expect(res.status).toBe(400)

		const body = (await res.json()) as ErrorResponse

		expect(body.error).toBe('Validation Error')
		expect(body.message).toContain('Invalid email address')
		expect(body.message).toContain('Password must be at least 8 characters')
		expect(body.statusCode).toBe(400)
	})

	it('passes through valid requests', async () => {
		const res = await app.request('/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: 'user@example.com', password: 'validpassword123' }),
		})

		expect(res.status).toBe(200)

		const body = (await res.json()) as { ok: boolean }

		expect(body.ok).toBe(true)
	})
})
