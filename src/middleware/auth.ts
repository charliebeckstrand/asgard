import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { loadEnv } from "../lib/env.js";

export type AuthUser = {
	id: string;
	email: string;
	roles?: string[];
};

type AuthEnv = {
	Variables: {
		user: AuthUser;
	};
};

/**
 * Authentication middleware that validates requests against Sigil.
 *
 * Expects a Bearer token in the Authorization header and verifies it
 * with the Sigil auth service. On success, sets `c.get("user")`.
 */
export function auth(): MiddlewareHandler<AuthEnv> {
	const env = loadEnv();

	return async (c: Context<AuthEnv>, next) => {
		const authorization = c.req.header("Authorization");

		if (!authorization?.startsWith("Bearer ")) {
			throw new HTTPException(401, { message: "Missing or invalid authorization header" });
		}

		const token = authorization.slice(7);

		if (!token) {
			throw new HTTPException(401, { message: "Invalid token" });
		}

		if (!env.SIGIL_URL) {
			throw new HTTPException(500, { message: "SIGIL_URL is not configured" });
		}

		if (!env.SIGIL_API_KEY) {
			throw new HTTPException(500, { message: "SIGIL_API_KEY is not configured" });
		}

		const response = await fetch(`${env.SIGIL_URL}/token/verify`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": env.SIGIL_API_KEY,
			},
			body: JSON.stringify({ token }),
		});

		if (!response.ok) {
			throw new HTTPException(401, { message: "Invalid or expired token" });
		}

		const user = (await response.json()) as AuthUser;

		c.set("user", user);

		await next();
	};
}

/**
 * Role-based authorization middleware.
 * Use after `auth()` to restrict access to specific roles.
 */
export function requireRole(...roles: string[]): MiddlewareHandler<AuthEnv> {
	return async (c: Context<AuthEnv>, next) => {
		const user = c.get("user");

		if (!user) {
			throw new HTTPException(401, { message: "Not authenticated" });
		}

		const hasRole = roles.some((role) => user.roles?.includes(role));

		if (!hasRole) {
			throw new HTTPException(403, {
				message: `Insufficient permissions. Required: ${roles.join(", ")}`,
			});
		}

		await next();
	};
}
