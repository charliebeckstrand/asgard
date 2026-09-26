import { z } from '@hono/zod-openapi'
import { TimestampSchema } from './primitives.js'
import { UserSchema } from './user.js'

export const SessionSchema = z
	.object({
		id: z.string().openapi({ description: 'SHA-256 of the session token, hex' }),
		created_at: TimestampSchema,
		expires_at: TimestampSchema,
		user: UserSchema,
	})
	.openapi('Session')

export type Session = z.infer<typeof SessionSchema>
