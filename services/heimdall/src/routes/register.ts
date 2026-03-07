import { randomUUID } from "node:crypto"
import { createRoute, OpenAPIHono } from "@hono/zod-openapi"
import { Algorithm, hash } from "@node-rs/argon2"
import { DetailSchema, RegisterSchema, UserResponseSchema } from "../lib/schemas.js"
import { rateLimit } from "../middleware/rate-limit.js"
import { createUser } from "../services/users.js"

const PG_UNIQUE_VIOLATION = "23505"

const registerRoute = createRoute({
	method: "post",
	path: "/register",
	tags: ["Auth"],
	summary: "Register a new user",
	request: {
		body: {
			content: { "application/json": { schema: RegisterSchema } },
			required: true,
		},
	},
	responses: {
		201: {
			content: { "application/json": { schema: UserResponseSchema } },
			description: "User created",
		},
		400: {
			content: { "application/json": { schema: DetailSchema } },
			description: "Validation error",
		},
		409: {
			content: { "application/json": { schema: DetailSchema } },
			description: "Email already registered",
		},
	},
})

export const register = new OpenAPIHono()

register.use("/register", rateLimit())

register.openapi(registerRoute, async (c) => {
	const { email: rawEmail, password } = c.req.valid("json")
	const email = rawEmail.trim().toLowerCase()

	const hashedPassword = await hash(password, { algorithm: Algorithm.Argon2id })

	let user: Awaited<ReturnType<typeof createUser>>
	try {
		user = await createUser(randomUUID(), email, hashedPassword)
	} catch (err: unknown) {
		if (err && typeof err === "object" && "code" in err && err.code === PG_UNIQUE_VIOLATION) {
			return c.json({ detail: "Email already registered" }, 409)
		}
		throw err
	}

	return c.json(
		{
			id: user.id,
			email: user.email,
			is_active: user.is_active,
			is_verified: user.is_verified,
			created_at: user.created_at,
		},
		201,
	)
})
