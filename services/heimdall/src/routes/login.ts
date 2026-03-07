import { createRoute, OpenAPIHono } from "@hono/zod-openapi"
import { Algorithm, hash, verify } from "@node-rs/argon2"
import { signToken } from "../lib/jwt.js"
import { DetailSchema, LoginSchema, TokenResponseSchema } from "../lib/schemas.js"
import { rateLimit } from "../middleware/rate-limit.js"
import { findCredentialsByEmail } from "../services/users.js"

// Generate a dummy hash at module load for timing-safe login.
// This ensures argon2 always runs even when the user is not found,
// preventing timing-based email enumeration.
const dummyHashPromise = hash("dummy-timing-pad", { algorithm: Algorithm.Argon2id })

const loginRoute = createRoute({
	method: "post",
	path: "/login",
	tags: ["Auth"],
	summary: "Authenticate and receive tokens",
	request: {
		body: {
			content: { "application/json": { schema: LoginSchema } },
			required: true,
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: TokenResponseSchema } },
			description: "Login successful",
		},
		401: {
			content: { "application/json": { schema: DetailSchema } },
			description: "Invalid credentials",
		},
		403: {
			content: { "application/json": { schema: DetailSchema } },
			description: "Account inactive",
		},
	},
})

export const login = new OpenAPIHono()

login.use("/login", rateLimit())

login.openapi(loginRoute, async (c) => {
	const { email: rawEmail, password } = c.req.valid("json")
	const email = rawEmail.trim().toLowerCase()

	const creds = await findCredentialsByEmail(email)
	const dummyHash = await dummyHashPromise
	const hash = creds?.hashed_password ?? dummyHash

	const passwordOk = await verify(hash, password)

	if (!creds || !passwordOk) {
		return c.json({ detail: "Incorrect email or password" }, 401)
	}

	if (!creds.is_active) {
		return c.json({ detail: "Account is inactive" }, 403)
	}

	const access = signToken(creds.id, "access")
	const refresh = signToken(creds.id, "refresh")

	return c.json(
		{
			access_token: access.token,
			refresh_token: refresh.token,
			token_type: "bearer" as const,
			expires_in: access.expiresIn,
		},
		200,
	)
})
