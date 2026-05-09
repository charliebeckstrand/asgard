import { HttpError } from 'grid'

const AUTH_STATUS = {
	invalid_credentials: 401,
	account_inactive: 403,
	email_exists: 409,
	invalid_token: 401,
} as const

export type AuthErrorCode = keyof typeof AUTH_STATUS

export class AuthError extends HttpError {
	constructor(
		public readonly code: AuthErrorCode,
		message: string,
	) {
		super(AUTH_STATUS[code], message, 'AuthError')
	}
}
