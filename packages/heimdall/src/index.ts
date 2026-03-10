// Configuration
export { configure } from './config.js'

// Middleware
export type { RateLimitOptions } from './middleware/rate-limit.js'
export { rateLimit } from './middleware/rate-limit.js'
export { vidarBanCheck } from './middleware/vidar.js'

// Auth service functions
export type { TokenPair } from './services/auth.js'
export {
	AuthError,
	authenticateUser,
	checkHealth,
	refreshTokenPair,
	registerNewUser,
	verifyAccessToken,
} from './services/auth.js'

// Vidar integration
export { reportEvent } from './vidar.js'
