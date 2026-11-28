import { createActivityRepository } from './activity-repository.js'
import { db } from './db.js'
import { createEmailTokenRepository } from './email-token-repository.js'
import { createMfaRepository } from './mfa-repository.js'
import { createOAuthRepository } from './oauth-repository.js'
import { createPasskeyRepository } from './passkey-repository.js'
import { createSessionRepository } from './session-repository.js'
import { createUserRepository } from './user-repository.js'

// The service's repositories, on its database. Tests of the rules in auth/ mock
// this module; the repositories' own tests build them on a test database.

export const userRepository = createUserRepository(db)

export const sessionRepository = createSessionRepository(db)

export const passkeyRepository = createPasskeyRepository(db)

export const mfaRepository = createMfaRepository(db)

export const oauthRepository = createOAuthRepository(db)

export const emailTokenRepository = createEmailTokenRepository(db)

export const activityRepository = createActivityRepository(db)
