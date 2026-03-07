import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateAuthReturn } from "../auth";
import { createMiddleware } from "../middleware";

function makeAuthHandler(session: Session | null): CreateAuthReturn["auth"] {
	return vi.fn(
		(handler) => (req: NextRequest) => handler(Object.assign(req, { auth: session })),
	) as unknown as CreateAuthReturn["auth"];
}

function makeRequest(pathname: string, origin = "http://localhost:3000"): NextRequest {
	return new NextRequest(new URL(pathname, origin));
}

const baseAuth: CreateAuthReturn = {
	auth: makeAuthHandler(null),
	handlers: {} as CreateAuthReturn["handlers"],
	signIn: vi.fn() as unknown as CreateAuthReturn["signIn"],
	signOut: vi.fn() as unknown as CreateAuthReturn["signOut"],
};

describe("createMiddleware", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("public routes", () => {
		it("allows unauthenticated requests through on a matched pattern", async () => {
			const middleware = createMiddleware({
				auth: { ...baseAuth, auth: makeAuthHandler(null) },
				publicPatterns: [/^\/auth(\/.*)?$/i],
			});

			const response = await middleware(makeRequest("/auth/login"));

			expect(response?.status).not.toBe(307);
		});

		it("allows nested public routes", async () => {
			const middleware = createMiddleware({
				auth: { ...baseAuth, auth: makeAuthHandler(null) },
				publicPatterns: [/^\/auth(\/.*)?$/i],
			});

			const response = await middleware(makeRequest("/auth/reset-password/token123"));

			expect(response?.status).not.toBe(307);
		});

		it("allows multiple public patterns", async () => {
			const middleware = createMiddleware({
				auth: { ...baseAuth, auth: makeAuthHandler(null) },
				publicPatterns: [/^\/auth(\/.*)?$/i, /^\/api\/health$/],
			});

			const response = await middleware(makeRequest("/api/health"));

			expect(response?.status).not.toBe(307);
		});
	});

	describe("protected routes", () => {
		it("redirects unauthenticated requests to /auth/login", async () => {
			const middleware = createMiddleware({
				auth: { ...baseAuth, auth: makeAuthHandler(null) },
			});

			const response = await middleware(makeRequest("/dashboard"));

			expect(response?.status).toBe(307);

			const location = response?.headers.get("location") ?? "";

			expect(location).toContain("/auth/login");
		});

		it("includes callbackUrl in the redirect", async () => {
			const middleware = createMiddleware({
				auth: { ...baseAuth, auth: makeAuthHandler(null) },
			});

			const response = await middleware(makeRequest("/dashboard/settings"));

			const location = response?.headers.get("location") ?? "";
			const url = new URL(location);

			expect(url.searchParams.get("callbackUrl")).toContain("/dashboard/settings");
		});

		it("allows authenticated requests through", async () => {
			const session: Session = {
				user: { id: "1", email: "test@example.com" },
				expires: new Date(Date.now() + 3600 * 1000).toISOString(),
			};

			const middleware = createMiddleware({
				auth: { ...baseAuth, auth: makeAuthHandler(session) },
			});

			const response = await middleware(makeRequest("/dashboard"));

			expect(response?.status).not.toBe(307);
		});
	});

	describe("pattern edge cases", () => {
		it("does not treat partial matches as public", async () => {
			const middleware = createMiddleware({
				auth: { ...baseAuth, auth: makeAuthHandler(null) },
				publicPatterns: [/^\/auth$/],
			});

			// /auth/login does NOT match /^\/auth$/ — should redirect
			const response = await middleware(makeRequest("/auth/login"));

			expect(response?.status).toBe(307);
		});

		it("protects all routes when publicPatterns is empty", async () => {
			const middleware = createMiddleware({
				auth: { ...baseAuth, auth: makeAuthHandler(null) },
			});

			const response = await middleware(makeRequest("/auth/login"));

			expect(response?.status).toBe(307);
		});
	});
});
