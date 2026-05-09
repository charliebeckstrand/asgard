import type { z } from '@hono/zod-openapi'
import { ErrorSchema } from 'skuld'

/**
 * Build a JSON request-body config for an OpenAPI route.
 *
 *     request: { body: jsonRequest(CreateUserSchema) }
 */
export const jsonRequest = <S extends z.ZodTypeAny>(schema: S) =>
	({
		content: { 'application/json': { schema } },
		required: true,
	}) as const

/**
 * Build a JSON response config for an OpenAPI route.
 *
 *     responses: { 200: jsonResponse(UserSchema, 'User found') }
 */
export const jsonResponse = <S extends z.ZodTypeAny>(schema: S, description: string) =>
	({
		content: { 'application/json': { schema } },
		description,
	}) as const

/** Shorthand for jsonResponse(ErrorSchema, description) — every error response uses this shape. */
export const errorResponse = (description: string) => jsonResponse(ErrorSchema, description)
