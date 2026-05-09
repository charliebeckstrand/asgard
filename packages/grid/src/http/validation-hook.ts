import type { Context, Env } from 'hono'
import { errorBody } from './error-handler.js'

type ValidationResult =
	| { success: true }
	| { success: false; error: { issues: Array<{ message: string }> } }

export function validationHook<E extends Env>(
	result: ValidationResult,
	c: Context<E>,
): Response | undefined {
	if (result.success) return

	const message = result.error.issues.map((issue) => issue.message).join('; ')

	return c.json(errorBody(400, message, 'Validation Error'), 400)
}
