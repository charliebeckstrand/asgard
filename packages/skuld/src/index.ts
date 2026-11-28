// Activity — what happened to an account
export {
	type Activity,
	type ActivityAction,
	ActivityListSchema,
	ActivitySchema,
} from './activity.js'

// Composites — structured schemas and schema factories
export {
	createListSchema,
	ErrorSchema,
	MessageSchema,
	toList,
} from './composites.js'

// Enums — shared status and category enumerations
export {
	ConnectionStatusSchema,
	HealthStatusSchema,
	type Role,
} from './enums.js'

// Passkey — a user's WebAuthn credential
export { type Passkey, PasskeySchema } from './passkey.js'

// Primitives — reusable atomic schema building blocks
export {
	EmailSchema,
	IdSchema,
	IpAddressSchema,
	LoginPasswordSchema,
	normalizeEmail,
	PasswordSchema,
	TimestampSchema,
} from './primitives.js'

// Security — threat detection and IP ban domain schemas
export {
	type BanList,
	BanListSchema,
	type BanSource,
	type CheckIpResponse,
	CheckIpResponseSchema,
	type IngestEvent,
	IngestEventSchema,
	ResolveThreatSchema,
	type RuleSeverity,
	type SecurityEvent,
	SecurityEventSchema,
	type Threat,
	type ThreatList,
	ThreatListSchema,
	ThreatSchema,
} from './security.js'

// Session — a signed-in session and its user
export { type Session, SessionSchema } from './session.js'

// User — canonical user account schema
export { type User, UserSchema } from './user.js'
