import { z } from '@hono/zod-openapi'
import { TimestampSchema } from './primitives.js'

export const PasskeySchema = z
	.object({
		id: z.string().openapi({ description: 'Credential ID, base64url' }),
		created_at: TimestampSchema,
	})
	.openapi('Passkey')

export type Passkey = z.infer<typeof PasskeySchema>
