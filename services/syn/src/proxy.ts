import "server-only";
import { type NextRequest, NextResponse } from "next/server";

import type { CreateAuthReturn } from "./auth";

// Hop-by-hop headers and browser session data that must never reach the upstream.
const STRIPPED_REQUEST_HEADERS = new Set([
	"authorization",
	"connection",
	"cookie",
	"host",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"set-cookie",
	"te",
	"trailers",
	"transfer-encoding",
	"upgrade",
]);

// Upstream response headers that conflict with Next.js streaming or the browser.
const STRIPPED_RESPONSE_HEADERS = new Set(["connection", "keep-alive", "transfer-encoding"]);

export interface CreateProxyConfig {
	apiOrigin: string;
	auth: Pick<CreateAuthReturn, "auth">;
}

export interface ProxyRouteContext {
	params: Promise<{ proxy: string[] }>;
}

type RouteHandler = (req: NextRequest, ctx: ProxyRouteContext) => Promise<NextResponse>;

export function createProxyRoute(config: CreateProxyConfig): RouteHandler {
	const apiOrigin = config.apiOrigin.replace(/\/$/, "");

	const { auth } = config;

	return async function handler(req: NextRequest, ctx: ProxyRouteContext): Promise<NextResponse> {
		const { proxy } = await ctx.params;

		const path = proxy.join("/");

		const upstream = `${apiOrigin}/${path}${req.nextUrl.search}`;

		const headers = new Headers();

		req.headers.forEach((value, key) => {
			if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
				headers.set(key, value);
			}
		});

		headers.set("x-forwarded-host", req.nextUrl.host);
		headers.set("x-forwarded-proto", req.nextUrl.protocol.replace(":", ""));

		const forwardedFor = req.headers.get("x-forwarded-for");

		if (forwardedFor) {
			headers.set("x-forwarded-for", forwardedFor);
		}

		const session = await auth.auth();

		if (session?.accessToken) {
			headers.set("authorization", `Bearer ${session.accessToken}`);
		}

		const hasBody = req.method !== "GET" && req.method !== "HEAD";

		const body = hasBody ? await req.arrayBuffer() : null;

		try {
			const upstreamRes = await fetch(upstream, {
				method: req.method,
				headers,
				body,
				redirect: "manual",
				...(body !== null ? { duplex: "half" as const } : {}),
			});

			const responseHeaders = new Headers();

			upstreamRes.headers.forEach((value, key) => {
				if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
					responseHeaders.set(key, value);
				}
			});

			return new NextResponse(upstreamRes.body, {
				status: upstreamRes.status,
				statusText: upstreamRes.statusText,
				headers: responseHeaders,
			});
		} catch (err) {
			console.error("[syn/proxy] upstream unreachable", {
				upstream,
				method: req.method,
				error: err instanceof Error ? err.message : String(err),
			});

			return NextResponse.json({ error: "Upstream unavailable" }, { status: 502 });
		}
	};
}
