import { z } from '@hono/zod-openapi'
import { EmailSchema, IdSchema, TimestampSchema } from './primitives.js'

export const UserSchema = z
	.object({
		id: IdSchema,
		email: EmailSchema,
		is_active: z.boolean(),
		is_verified: z.boolean(),
		created_at: TimestampSchema,
		updated_at: TimestampSchema,
	})
	.openapi('User')

export type User = z.infer<typeof UserSchema>
