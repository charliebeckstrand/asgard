import { type NextProxy, NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";

import type { CreateAuthReturn } from "./auth";

export interface CreateMiddlewareConfig {
	auth: Pick<CreateAuthReturn, "auth"> | CreateAuthReturn["auth"];
	publicPatterns?: RegExp[];
}

export function createMiddleware(config: CreateMiddlewareConfig): NextProxy {
	const { publicPatterns = [] } = config;

	// Accept either the full object ({ auth: fn }) or the bare function
	const authFn =
		typeof config.auth === "function"
			? config.auth
			: (config.auth as Pick<CreateAuthReturn, "auth">).auth;

	const handler = authFn(async (req: NextAuthRequest) => {
		const { pathname } = req.nextUrl;

		if (publicPatterns.some((pattern) => pattern.test(pathname))) {
			return NextResponse.next();
		}

		if (!req.auth) {
			const loginUrl = new URL("/auth/login", req.nextUrl.origin);

			loginUrl.searchParams.set("callbackUrl", req.nextUrl.href);

			return NextResponse.redirect(loginUrl);
		}

		return NextResponse.next();
	}) as unknown as NextProxy;

	return (req: Parameters<NextProxy>[0], ev: Parameters<NextProxy>[1]) =>
		handler(req as unknown as NextAuthRequest, ev as unknown as Parameters<NextProxy>[1]);
}
