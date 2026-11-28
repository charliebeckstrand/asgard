import { type Db, sql } from 'saga'

export type OAuthProvider = 'github' | 'google'

/** A GitHub or Google account, as the provider reports it. */
export interface OAuthIdentity {
	provider: OAuthProvider
	/** The ID of the account at the provider. It stays the same when its email changes. */
	subject: string
	/** The verified email of the account, or null when it has none. */
	email: string | null
}

/** A sign-in that waits on the provider. */
export interface StoredOAuthState {
	provider: OAuthProvider
	verifier: string
	/** The app origin that started the sign-in, for the redirect URI. */
	origin: string
	return_to: string
	/** The user who connects the account, or null for a sign-in. */
	user_id: string | null
}

export interface LinkedIdentity {
	provider: OAuthProvider
	email: string | null
	created_at: string
}

export function createOAuthRepository(db: Db) {
	return {
		async createState(id: string, state: StoredOAuthState, expiresAt: Date) {
			await db.exec(
				sql`
					INSERT INTO oauth_states (id, provider, verifier, origin, return_to, user_id, expires_at)
					VALUES (
						${id}, ${state.provider}, ${state.verifier}, ${state.origin},
						${state.return_to}, ${state.user_id}, ${expiresAt}
					)
				`,
			)
		},

		/** Deletes a live state and returns it, so each state works once. */
		async useState(id: string) {
			return db.first<StoredOAuthState>(
				sql`
					DELETE FROM oauth_states
					WHERE id = ${id} AND expires_at > now()
					RETURNING provider, verifier, origin, return_to, user_id
				`,
			)
		},

		async deleteExpiredStates() {
			return db.exec(sql`DELETE FROM oauth_states WHERE expires_at <= now()`)
		},

		/** The user of the identity, or null when no user has it. */
		async findIdentityUser(provider: OAuthProvider, subject: string) {
			const row = await db.first<{ user_id: string }>(
				sql`SELECT user_id FROM identities WHERE provider = ${provider} AND subject = ${subject}`,
			)

			return row?.user_id ?? null
		},

		/**
		 * Makes a user with no password, marked verified, and gives it the identity.
		 * Refuses when a user already has the email.
		 */
		async createUserWithIdentity({ provider, subject, email }: OAuthIdentity & { email: string }) {
			return db.tx(async (tx) => {
				const user = await tx.first<{ id: string }>(
					sql`
						INSERT INTO users (email, hashed_password, is_verified)
						VALUES (${email}, NULL, true)
						ON CONFLICT (email) DO NOTHING
						RETURNING id
					`,
				)

				if (!user) return 'email_exists' as const

				await tx.exec(
					sql`
						INSERT INTO identities (provider, subject, user_id, email)
						VALUES (${provider}, ${subject}, ${user.id}, ${email})
					`,
				)

				return { userId: user.id }
			})
		},

		/**
		 * Gives the identity to the user. `in_use` means another user has it, and
		 * `provider_linked` means the user has another account of that provider.
		 */
		async linkIdentity(userId: string, { provider, subject, email }: OAuthIdentity) {
			return db.tx(async (tx) => {
				const owner = await tx.first<{ user_id: string }>(
					sql`
						SELECT user_id FROM identities
						WHERE provider = ${provider} AND subject = ${subject}
						FOR UPDATE
					`,
				)

				if (owner) return owner.user_id === userId ? ('linked' as const) : ('in_use' as const)

				const added = await tx.exec(
					sql`
						INSERT INTO identities (provider, subject, user_id, email)
						VALUES (${provider}, ${subject}, ${userId}, ${email})
						ON CONFLICT DO NOTHING
					`,
				)

				return added ? ('linked' as const) : ('provider_linked' as const)
			})
		},

		async getIdentities(userId: string) {
			return db.many<LinkedIdentity>(
				sql`
					SELECT provider, email, created_at FROM identities
					WHERE user_id = ${userId}
					ORDER BY provider
				`,
			)
		},

		/**
		 * Removes the identity, unless the user then has no way to sign in: no
		 * password, no other identity, and no passkey.
		 */
		async unlinkIdentity(userId: string, provider: OAuthProvider) {
			return db.tx(async (tx) => {
				// Serializes removals for one user, so two can't both remove "not the last" way in.
				const user = await tx.first<{ has_password: boolean }>(
					sql`
						SELECT hashed_password IS NOT NULL AS has_password
						FROM users WHERE id = ${userId}
						FOR UPDATE
					`,
				)

				const identity = await tx.first(
					sql`SELECT 1 FROM identities WHERE user_id = ${userId} AND provider = ${provider}`,
				)

				if (!user || !identity) return 'not_found' as const

				const others = await tx.val<number>(
					sql`
						SELECT
							(SELECT count(*) FROM identities WHERE user_id = ${userId} AND provider <> ${provider})::int
							+ (SELECT count(*) FROM passkeys WHERE user_id = ${userId})::int
					`,
				)

				if (!user.has_password && others === 0) return 'last_sign_in' as const

				await tx.exec(
					sql`DELETE FROM identities WHERE user_id = ${userId} AND provider = ${provider}`,
				)

				return 'deleted' as const
			})
		},
	}
}

export type OAuthRepository = ReturnType<typeof createOAuthRepository>
