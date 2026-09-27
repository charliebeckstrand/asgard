import { z } from '@hono/zod-openapi'
import { createListSchema } from './composites.js'
import { IdSchema, TimestampSchema } from './primitives.js'

export const ActivityActionSchema = z
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
