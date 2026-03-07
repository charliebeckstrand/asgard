import type { MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import { loadEnv } from "../lib/env.js"

export function apiKeyAuth(): MiddlewareHandler {
	const env = loadEnv()

	return async (c, next) => {
		if (!env.HEIMDALL_API_KEY) {
			await next()
			return
		}

		const provided = c.req.header("x-api-key") ?? ""

		if (provided !== env.HEIMDALL_API_KEY) {
			throw new HTTPException(401, { message: "Invalid or missing API key" })
		}

		await next()
	}
}
