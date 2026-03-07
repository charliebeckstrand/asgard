import { createRoute, OpenAPIHono } from "@hono/zod-openapi"
import { signToken, verifyToken } from "../lib/jwt.js"
import { DetailSchema, RefreshSchema, TokenResponseSchema } from "../lib/schemas.js"
import { findUserById } from "../services/users.js"

const refreshRoute = createRoute({
	method: "post",
	path: "/token/refresh",
	tags: ["Auth"],
	summary: "Refresh access token",
	request: {
		body: {
			content: { "application/json": { schema: RefreshSchema } },
			required: true,
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: TokenResponseSchema } },
			description: "Tokens refreshed",
		},
		401: {
			content: { "application/json": { schema: DetailSchema } },
			description: "Invalid refresh token",
		},
	},
})

export const refresh = new OpenAPIHono().openapi(refreshRoute, async (c) => {
	const { refresh_token } = c.req.valid("json")

	let claims: ReturnType<typeof verifyToken>
	try {
		claims = verifyToken(refresh_token)
	} catch {
		return c.json({ detail: "Invalid or expired refresh token" }, 401)
	}

	if (claims.type !== "refresh") {
		return c.json({ detail: "Invalid or expired refresh token" }, 401)
	}

	const user = await findUserById(claims.sub)

	if (!user || !user.is_active) {
		return c.json({ detail: "Invalid or expired refresh token" }, 401)
	}

	const access = signToken(user.id, "access")
	const newRefresh = signToken(user.id, "refresh")

	return c.json(
		{
			access_token: access.token,
			refresh_token: newRefresh.token,
			token_type: "bearer" as const,
			expires_in: access.expiresIn,
		},
		200,
	)
})
