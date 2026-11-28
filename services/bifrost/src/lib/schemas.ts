import { z } from '@hono/zod-openapi'
import { createListSchema, IdSchema, TimestampSchema, UserSchema } from 'skuld'

/** The form every email is stored and looked up in. */
export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase()
}

export const PasswordSchema = z
	.string()
	.min(8, 'Password must be at least 8 characters')
	.max(128, 'Password must be at most 128 characters')
	.openapi({ description: 'Password (8 to 128 characters)' })

// Capped like PasswordSchema so a huge body can't make argon2 burn CPU.
export const LoginPasswordSchema = z
	.string()
	.min(1)
	.max(128)
	.openapi({ description: 'Login password' })

const ActivityActionSchema = z
	.enum([
		'signed_in',
		'signed_out_elsewhere',
		'email_verified',
		'password_reset',
		'passkey_added',
		'passkey_removed',
		'authenticator_added',
		'authenticator_removed',
		'recovery_codes_created',
		'account_connected',
		'account_disconnected',
		'deactivated',
		'reactivated',
		'promoted',
		'demoted',
		'second_factors_reset',
	])
	.openapi('ActivityAction')

export type ActivityAction = z.infer<typeof ActivityActionSchema>

export const ActivitySchema = z
	.object({
		id: IdSchema,
		action: ActivityActionSchema,
		detail: z.string().nullable().openapi({
			description: 'More about the action: how the user signed in, or which provider',
			example: 'passkey',
		}),
		actor_id: IdSchema.nullable().openapi({
			description: 'Who did it: the user, an admin, or null for the operator',
		}),
		ip: z.string().nullable(),
		created_at: TimestampSchema,
	})
	.openapi('Activity')

export type Activity = z.infer<typeof ActivitySchema>

export const ActivityListSchema = createListSchema(ActivitySchema, 'ActivityList')

export const PasskeySchema = z
	.object({
		id: z.string().openapi({ description: 'Credential ID, base64url' }),
		created_at: TimestampSchema,
	})
	.openapi('Passkey')

export type Passkey = z.infer<typeof PasskeySchema>

export const SessionSchema = z
	.object({
		id: z.string().openapi({ description: 'SHA-256 of the session token, hex' }),
		created_at: TimestampSchema,
		expires_at: TimestampSchema,
		two_step: z.boolean().openapi({
			description:
				'Whether the session passed a second step: a passkey sign-in, or a passkey, app code or recovery code checked on it',
		}),
		user: UserSchema,
	})
	.openapi('Session')

export type Session = z.infer<typeof SessionSchema>
