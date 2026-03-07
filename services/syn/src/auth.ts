import "server-only";
import NextAuth, {
	type NextAuthConfig,
	type NextAuthResult,
	type Session,
	type User,
} from "next-auth";
import Credentials from "next-auth/providers/credentials";

export interface CreateAuthConfig {
	apiOrigin: string;
	session?: {
		maxAge?: number;
	};
}

export type AuthHandler = (...args: any[]) => Promise<any>;

export type CreateAuthReturn = {
	auth: AuthHandler;
	handlers: NextAuthResult["handlers"];
	signIn: NextAuthResult["signIn"];
	signOut: NextAuthResult["signOut"];
};

interface AuthorizedUser extends User {
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
}

interface LoginResponse {
	user?: { id?: string; email?: string };
	access_token: string;
	refresh_token: string;
	expires_in: number;
}

interface RefreshResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
}

export function createAuth(config: CreateAuthConfig): CreateAuthReturn {
	const { apiOrigin: rawOrigin, session: sessionConfig } = config;

	// Strip trailing slash once — prevents double-slash in upstream URLs
	const apiOrigin = rawOrigin.replace(/\/$/, "");

	// Scoped refresh lock — one per createAuth instance, not module-global.
	let refreshLock: Promise<Record<string, unknown>> | null = null;

	async function refreshAccessToken(
		token: Record<string, unknown>,
	): Promise<Record<string, unknown>> {
		if (refreshLock) {
			return refreshLock;
		}

		const attempt = (async () => {
			try {
				const res = await fetch(`${apiOrigin}/auth/token/refresh`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ refresh_token: token["refreshToken"] }),
				});

				if (!res.ok) {
					throw new Error(`Refresh failed: ${res.status}`);
				}

				const data = (await res.json()) as RefreshResponse;

				return {
					...token,
					accessToken: data.access_token,
					refreshToken: data.refresh_token,
					expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
					error: undefined,
				};
			} catch {
				return { ...token, error: "RefreshTokenError" };
			}
		})();

		refreshLock = attempt;

		// Clear after settlement so subsequent expirations can refresh again.
		void attempt.finally(() => {
			refreshLock = null;
		});

		return attempt;
	}

	const nextAuthConfig: NextAuthConfig = {
		providers: [
			Credentials({
				name: "credentials",
				credentials: {
					email: { label: "Email", type: "email" },
					password: { label: "Password", type: "password" },
				},

				async authorize(credentials): Promise<User | null> {
					if (!credentials?.email || !credentials?.password) {
						return null;
					}

					try {
						const res = await fetch(`${apiOrigin}/auth/login`, {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								email: credentials.email,
								password: credentials.password,
							}),
						});

						if (!res.ok) return null;

						const data = (await res.json()) as LoginResponse;

						const authorizedUser: AuthorizedUser = {
							id: data.user?.id ?? "",
							email: data.user?.email ?? "",
							accessToken: data.access_token,
							refreshToken: data.refresh_token,
							expiresIn: data.expires_in,
						};

						return authorizedUser;
					} catch {
						return null;
					}
				},
			}),
		],

		session: {
			strategy: "jwt",
			maxAge: sessionConfig?.maxAge ?? 60 * 60 * 24 * 7,
		},

		callbacks: {
			async jwt({ token, user }) {
				// Initial sign-in — seed the JWT from the authorize response
				if (user) {
					const u = user as AuthorizedUser;

					return {
						...token,
						accessToken: u.accessToken,
						refreshToken: u.refreshToken,
						expiresAt: Math.floor(Date.now() / 1000) + u.expiresIn,
					};
				}

				// Token still valid — 30s buffer prevents expiry mid-request
				if (typeof token["expiresAt"] === "number" && Date.now() / 1000 < token["expiresAt"] - 30) {
					return token;
				}

				return refreshAccessToken(token);
			},

			async session({ session, token }): Promise<Session> {
				const accessToken =
					typeof token["accessToken"] === "string" ? token["accessToken"] : undefined;

				const error = token["error"] as string | undefined;

				return {
					...session,
					accessToken,
					error,
				};
			},
		},

		pages: {
			signIn: "/auth/login",
			error: "/auth/error",
		},
	};

	return NextAuth(nextAuthConfig) as CreateAuthReturn;
}
