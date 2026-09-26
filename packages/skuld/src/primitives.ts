import { z } from '@hono/zod-openapi'

export const IdSchema = z.uuid().openapi({
	description: 'Unique identifier (UUID)',
	example: '550e8400-e29b-41d4-a716-446655440000',
})

export type Id = z.infer<typeof IdSchema>

export const IpAddressSchema = z
	.union([z.ipv4(), z.ipv6()])
	.openapi({ description: 'IPv4 or IPv6 address', example: '192.168.1.100' })

export type IpAddress = z.infer<typeof IpAddressSchema>

export const EmailSchema = z.email('Invalid email address').openapi({ example: 'user@example.com' })

export type Email = z.infer<typeof EmailSchema>

export const PasswordSchema = z
	.string()
	.min(8, 'Password must be at least 8 characters')
	.max(128, 'Password must be at most 128 characters')
	.openapi({ description: 'Password (8 to 128 characters)' })

export type Password = z.infer<typeof PasswordSchema>

// Capped like PasswordSchema so a huge body can't make argon2 burn CPU.
export const LoginPasswordSchema = z
	.string()
	.min(1)
	.max(128)
	.openapi({ description: 'Login password' })

export type LoginPassword = z.infer<typeof LoginPasswordSchema>

export const TimestampSchema = z.iso.datetime().openapi({
	description: 'ISO 8601 datetime',
	example: '2026-01-01T00:00:00.000Z',
})

export type Timestamp = z.infer<typeof TimestampSchema>
