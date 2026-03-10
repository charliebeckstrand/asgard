export type { TokenPair } from './auth.js'
export {
	AuthError,
	authenticateUser,
	checkHealth,
	refreshTokenPair,
	registerNewUser,
	verifyAccessToken,
} from './auth.js'
export { configure } from './config.js'
export type { RateLimitOptions } from './rate-limit.js'
export { rateLimit } from './rate-limit.js'
export { reportEvent, vidarBanCheck } from './vidar.js'
