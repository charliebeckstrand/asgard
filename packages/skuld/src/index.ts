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
} from './enums.js'

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
	type CheckIpResponse,
	CheckIpResponseSchema,
	type CreateBan,
	CreateBanSchema,
	type IngestEvent,
	IngestEventSchema,
	type SecurityEvent,
	SecurityEventSchema,
} from './security.js'

// User — canonical user account schema
export { type User, UserSchema } from './user.js'
