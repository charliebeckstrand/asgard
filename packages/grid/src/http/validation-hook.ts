import type { Context, Env } from 'hono'

type ValidationResult =
	| { success: true }
	| { success: false; error: { issues: Array<{ message: string }> } }

export function validationHook<E extends Env>(
	result: ValidationResult,
	c: Context<E>,
): Response | undefined {
	if (result.success) return

	const messages = result.error.issues.map((issue) => issue.message)

	return c.json(
		{
			error: 'Validation Error',
			message: messages.join('; '),
			statusCode: 400,
		},
		400,
	)
}
