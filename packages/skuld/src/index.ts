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
	type UserRole,
	UserRoleSchema,
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
	type SecurityEvent,
	SecurityEventSchema,
} from './security.js'

// Session — a signed-in session and its user
export { type Session, SessionSchema } from './session.js'

// User — canonical user account schema
export { type User, UserSchema } from './user.js'
