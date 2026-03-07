/**
 * Type-safe client for consuming Bifrost API endpoints.
 *
 * Usage in Yggdrasil or other consuming apps:
 *
 * ```ts
 * import { createClient } from "bifrost/client";
 *
 * const api = createClient({
 *   baseUrl: "http://localhost:3000",
 *   token: "your-bifrost-token",
 * });
 *
 * const health = await api.get("/health");
 * const users = await api.get("/users", { query: { page: 1, limit: 10 } });
 * ```
 */

export type ClientOptions = {
	baseUrl: string;
	token?: string;
	headers?: Record<string, string>;
};

type RequestOptions = {
	query?: Record<string, string | number>;
	body?: unknown;
};

export function createClient(options: ClientOptions) {
	const { baseUrl, token, headers: customHeaders = {} } = options;

	const baseHeaders: Record<string, string> = {
		...(token ? { Authorization: `Bearer ${token}` } : {}),
		...customHeaders,
	};

	async function request<T>(method: string, path: string, opts?: RequestOptions): Promise<T> {
		const url = new URL(path, baseUrl);

		if (opts?.query) {
			for (const [key, value] of Object.entries(opts.query)) {
				url.searchParams.set(key, String(value));
			}
		}

		const headers: Record<string, string> = {
			...baseHeaders,
			...(opts?.body ? { "Content-Type": "application/json" } : {}),
		};

		const res = await fetch(url, {
			method,
			headers,
			body: opts?.body ? JSON.stringify(opts.body) : undefined,
		});

		if (!res.ok) {
			const error = await res.json().catch(() => ({ message: res.statusText }));
			
			throw new ClientError(res.status, error as { message: string });
		}

		return res.json() as Promise<T>;
	}

	return {
		get: <T>(path: string, opts?: Pick<RequestOptions, "query">) => request<T>("GET", path, opts),

		post: <T>(path: string, opts?: RequestOptions) => request<T>("POST", path, opts),

		put: <T>(path: string, opts?: RequestOptions) => request<T>("PUT", path, opts),

		patch: <T>(path: string, opts?: RequestOptions) => request<T>("PATCH", path, opts),

		delete: <T>(path: string, opts?: Pick<RequestOptions, "query">) =>
			request<T>("DELETE", path, opts),
	};
}

export class ClientError extends Error {
	constructor(
		public status: number,
		public body: { message: string },
	) {
		super(body.message);
		this.name = "ClientError";
	}
}
