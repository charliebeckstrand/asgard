import { z } from '@hono/zod-openapi'
import { TimestampSchema } from './primitives.js'
import { UserSchema } from './user.js'

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
