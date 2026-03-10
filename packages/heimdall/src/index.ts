// Configuration

// Standalone app factory
export { createAuthApp } from './app.js'
export type { HeimdallConfig } from './config.js'
export { configure, getConfig } from './config.js'
export type { Claims, TokenType } from './jwt.js'
// JWT utilities
export { signToken, verifyToken } from './jwt.js'
// Middleware
export { apiKeyAuth } from './middleware/api-key.js'
export type { AuthEnv } from './middleware/bearer.js'
export { bearer } from './middleware/bearer.js'
export type { RateLimitOptions } from './middleware/rate-limit.js'
export { rateLimit } from './middleware/rate-limit.js'
export { vidarBanCheck } from './middleware/vidar.js'
// Schemas
export {
	DetailSchema,
	HealthResponseSchema,
	LoginSchema,
	RefreshSchema,
	RegisterSchema,
	TokenResponseSchema,
	UserResponseSchema,
	VerifySchema,
} from './schemas.js'
export type { TokenPair } from './services/auth.js'
// Auth service functions
export {
	AuthError,
	authenticateUser,
	checkHealth,
	refreshTokenPair,
	registerNewUser,
	verifyAccessToken,
} from './services/auth.js'
export type { CredentialsRow, UserRow } from './services/users.js'
// User service functions
export { deactivateUser, findUserById } from './services/users.js'
