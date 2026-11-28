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

// Primitives — reusable atomic schema building blocks
export {
	EmailSchema,
	IdSchema,
	IpAddressSchema,
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

// User — canonical user account schema
export { type User, UserSchema } from './user.js'
