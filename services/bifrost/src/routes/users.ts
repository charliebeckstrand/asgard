import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"

import { ErrorSchema, PaginationSchema } from "../lib/schemas.js"

// --- Schemas ---

const UserSchema = z
	.object({
		id: z.string().uuid(),
		email: z.string().email(),
		name: z.string(),
		roles: z.array(z.string()),
		createdAt: z.string().datetime(),
	})
	.openapi("User")

const UserListSchema = z
	.object({
		data: z.array(UserSchema),
		total: z.number(),
		page: z.number(),
		limit: z.number(),
	})
	.openapi("UserList")

// --- Routes ---
// To guard with Ironclad: add `middleware: [auth(), requireRole("admin")]` to route config

const listUsers = createRoute({
	method: "get",
	path: "/users",
	tags: ["Users"],
	summary: "List users",
	description: "Retrieve a paginated list of users. Requires authentication.",
	security: [{ Bearer: [] }],
	request: {
		query: PaginationSchema,
	},
	responses: {
		200: {
			content: { "application/json": { schema: UserListSchema } },
			description: "Paginated user list",
		},
		401: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Unauthorized",
		},
	},
})

const getUser = createRoute({
	method: "get",
	path: "/users/{id}",
	tags: ["Users"],
	summary: "Get user by ID",
	description: "Retrieve a single user by their ID. Requires authentication.",
	security: [{ Bearer: [] }],
	request: {
		params: z.object({
			id: z
				.string()
				.uuid()
				.openapi({ description: "User ID", example: "550e8400-e29b-41d4-a716-446655440000" }),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: UserSchema } },
			description: "User details",
		},
		401: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Unauthorized",
		},
		404: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "User not found",
		},
	},
})

// --- Handlers ---

export const users = new OpenAPIHono()
	.openapi(listUsers, async (c) => {
		const { page, limit } = c.req.valid("query")

		// TODO: Proxy to actual user service
		return c.json(
			{
				data: [],
				total: 0,
				page,
				limit,
			},
			200,
		)
	})
	.openapi(getUser, async (c) => {
		const { id } = c.req.valid("param")

		// TODO: Proxy to actual user service
		return c.json(
			{
				id,
				email: "user@example.com",
				name: "Example User",
				roles: ["user"],
				createdAt: new Date().toISOString(),
			},
			200,
		)
	})
