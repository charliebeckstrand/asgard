import { z } from 'zod'

export const DetailSchema = z
	.object({
		detail: z.string(),
	})
	.openapi('Detail')

export const RegisterSchema = z
	.object({
		email: z.string().email().openapi({ example: 'user@example.com' }),
		password: z
			.string()
			.min(8, 'Password must be between 8 and 128 characters')
			.max(128, 'Password must be between 8 and 128 characters')
			.openapi({ example: 'securepassword' }),
	})
	.openapi('RegisterRequest')

export const LoginSchema = z
	.object({
		email: z.string().email().openapi({ example: 'user@example.com' }),
		password: z.string().min(1).openapi({ example: 'securepassword' }),
	})
	.openapi('LoginRequest')

export const RefreshSchema = z
	.object({
		refresh_token: z.string().min(1),
	})
	.openapi('RefreshRequest')

export const VerifySchema = z
	.object({
		token: z.string().min(1),
	})
	.openapi('VerifyRequest')

export const UserResponseSchema = z
	.object({
		id: z.string().uuid(),
		email: z.string().email(),
		is_active: z.boolean(),
		is_verified: z.boolean(),
		created_at: z.string().datetime(),
	})
	.openapi('UserResponse')

export const TokenResponseSchema = z
	.object({
		access_token: z.string(),
		refresh_token: z.string(),
		token_type: z.literal('bearer'),
		expires_in: z.number(),
	})
	.openapi('TokenResponse')

export const HealthResponseSchema = z
	.object({
		status: z.string(),
		service: z.string(),
	})
	.openapi('HeimdallHealthResponse')
