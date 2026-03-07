import { createRoute, OpenAPIHono } from "@hono/zod-openapi"
import { verifyToken } from "../lib/jwt.js"
import { DetailSchema, UserResponseSchema, VerifySchema } from "../lib/schemas.js"
import { apiKeyAuth } from "../middleware/api-key.js"
import { findUserById } from "../services/users.js"

const verifyRoute = createRoute({
	method: "post",
	path: "/token/verify",
	tags: ["Auth"],
	summary: "Verify an access token",
	description: "Service-to-service token verification. Optionally protected by API key.",
	security: [{ ApiKey: [] }],
	request: {
		body: {
			content: { "application/json": { schema: VerifySchema } },
			required: true,
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: UserResponseSchema } },
			description: "Token is valid",
		},
		401: {
			content: { "application/json": { schema: DetailSchema } },
			description: "Invalid token or API key",
		},
	},
})

export const verify = new OpenAPIHono()

verify.use("/token/verify", apiKeyAuth())

verify.openapi(verifyRoute, async (c) => {
	const { token } = c.req.valid("json")

	let claims: ReturnType<typeof verifyToken>
	try {
		claims = verifyToken(token)
	} catch {
		return c.json({ detail: "Invalid or expired token" }, 401)
	}

	if (claims.type !== "access") {
		return c.json({ detail: "Invalid token type" }, 401)
	}

	const user = await findUserById(claims.sub)

	if (!user || !user.is_active) {
		return c.json({ detail: "Invalid or expired token" }, 401)
	}

	return c.json(
		{
			id: user.id,
			email: user.email,
			is_active: user.is_active,
			is_verified: user.is_verified,
			created_at: user.created_at,
		},
		200,
	)
})
