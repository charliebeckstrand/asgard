import { z } from '@hono/zod-openapi'

export const IdSchema = z.uuid().openapi({
	description: 'Unique identifier (UUID)',
	example: '550e8400-e29b-41d4-a716-446655440000',
})

export const IpAddressSchema = z
	.string()
	.min(1)
	.openapi({ description: 'IP address', example: '192.168.1.100' })

export const EmailSchema = z.email('Invalid email address').openapi({ example: 'user@example.com' })

export const PasswordSchema = z
	.string()
	.min(8, 'Password must be at least 8 characters')
	.openapi({ description: 'Password (min 8 characters)' })

export const LoginPasswordSchema = z.string().min(1).openapi({ description: 'Login password' })

export const TimestampSchema = z.iso.datetime().openapi({
	description: 'ISO 8601 datetime',
	example: '2026-01-01T00:00:00.000Z',
})

// Internal helpers — used only by security.ts. Not part of the public API.
export const OptionalTimestampSchema = z.iso.datetime().optional().openapi({
	description: 'Optional ISO 8601 datetime',
})

export const ServiceNameSchema = z
	.string()
	.min(1)
	.max(100)
	.openapi({ description: 'Service name', example: 'bifrost' })

export const EventTypeSchema = z
	.string()
	.min(1)
	.openapi({ description: 'Type of event', example: 'login_failed' })

export const DetailsSchema = z
	.record(z.string(), z.unknown())
	.default({})
	.openapi({ description: 'Additional details' })
