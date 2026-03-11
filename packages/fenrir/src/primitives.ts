import { z } from '@hono/zod-openapi'

// --- Identifiers ---

export const IdSchema = z.uuid().openapi({
	description: 'Unique identifier (UUID)',
	example: '550e8400-e29b-41d4-a716-446655440000',
})

export const StringIdSchema = z.string().min(1).openapi({ description: 'String identifier' })

// --- Network ---

export const IpAddressSchema = z
	.string()
	.min(1)
	.openapi({ description: 'IP address', example: '192.168.1.100' })

export const UrlSchema = z.url().openapi({
	description: 'Valid URL',
	example: 'https://example.com',
})

export const CallbackUrlSchema = z.url().openapi({
	description: 'URL to receive callbacks',
	example: 'http://localhost:3000/api/webhooks/event',
})

// --- Auth ---

export const EmailSchema = z.email().openapi({ example: 'user@example.com' })

export const PasswordSchema = z
	.string()
	.min(8)
	.openapi({ description: 'Password (min 8 characters)' })

export const LoginPasswordSchema = z.string().min(1).openapi({ description: 'Login password' })

// --- Timestamps ---

export const TimestampSchema = z.iso.datetime().openapi({
	description: 'ISO 8601 datetime',
	example: '2026-01-01T00:00:00.000Z',
})

export const OptionalTimestampSchema = z.iso.datetime().optional().openapi({
	description: 'Optional ISO 8601 datetime',
})

// --- Generic fields ---

export const ServiceNameSchema = z
	.string()
	.min(1)
	.max(100)
	.openapi({ description: 'Service name', example: 'bifrost' })

export const TopicSchema = z
	.string()
	.min(1)
	.max(255)
	.openapi({ description: 'Event topic', example: 'user.registered' })

export const TopicFilterSchema = z.string().optional().openapi({ description: 'Filter by topic' })

export const EventTypeSchema = z
	.string()
	.min(1)
	.openapi({ description: 'Type of event', example: 'login_failed' })

export const PayloadSchema = z
	.record(z.string(), z.unknown())
	.default({})
	.openapi({ description: 'Arbitrary payload data' })

export const DetailsSchema = z
	.record(z.string(), z.unknown())
	.default({})
	.openapi({ description: 'Additional details' })

export const MetadataSchema = z
	.record(z.string(), z.unknown())
	.default({})
	.openapi({ description: 'Metadata key-value pairs' })
