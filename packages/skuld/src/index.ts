// Activity — what happened to an account
export {
	type Activity,
	type ActivityAction,
	ActivityActionSchema,
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
	type ConnectionStatus,
	ConnectionStatusSchema,
	type HealthStatus,
	HealthStatusSchema,
	type Role,
	RoleSchema,
} from './enums.js'

// Passkey — a user's WebAuthn credential
export { type Passkey, PasskeySchema } from './passkey.js'

// Primitives — reusable atomic schema building blocks
export {
	type Email,
	EmailSchema,
	type Id,
	IdSchema,
	type IpAddress,
	IpAddressSchema,
	type LoginPassword,
	LoginPasswordSchema,
	normalizeEmail,
	type Password,
	PasswordSchema,
	type Timestamp,
	TimestampSchema,
} from './primitives.js'

// Security — threat detection and IP ban domain schemas
export {
	type Ban,
	type BanList,
	BanListSchema,
	BanSchema,
	type BanSource,
	BanSourceSchema,
	type CheckIpResponse,
	CheckIpResponseSchema,
	type CreateBan,
	CreateBanSchema,
	type IngestEvent,
	IngestEventSchema,
	ResolveThreatSchema,
	type RuleSeverity,
	RuleSeveritySchema,
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
