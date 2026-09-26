import { z } from '@hono/zod-openapi'
import { RoleSchema } from './enums.js'
import { EmailSchema, IdSchema, TimestampSchema } from './primitives.js'

export const UserSchema = z
	.object({
		id: IdSchema,
		email: EmailSchema,
		is_active: z.boolean(),
		is_verified: z.boolean(),
		roles: z
			.array(RoleSchema)
			.openapi({ description: 'The roles of the account; none means it can change nothing' }),
		created_at: TimestampSchema,
		updated_at: TimestampSchema,
	})
	.openapi('User')

export type User = z.infer<typeof UserSchema>
