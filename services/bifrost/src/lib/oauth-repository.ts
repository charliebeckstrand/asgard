import { sql } from 'saga'
import type { LinkedIdentity, OAuthRepository, StoredOAuthState } from '../auth/types.js'
import { db } from './db.js'

export function createOAuthRepository(): OAuthRepository {
	return {
		async createState(id, state, expiresAt) {
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

		async useState(id) {
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

		async findIdentityUser(provider, subject) {
			const row = await db.first<{ user_id: string }>(
				sql`SELECT user_id FROM identities WHERE provider = ${provider} AND subject = ${subject}`,
			)

			return row?.user_id ?? null
		},

		async createUserWithIdentity({ provider, subject, email }) {
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

		async linkIdentity(userId, { provider, subject, email }) {
			return db.tx(async (tx) => {
				const owner = await tx.first<{ user_id: string }>(
					sql`
						SELECT user_id FROM identities
						WHERE provider = ${provider} AND subject = ${subject}
						FOR UPDATE
					`,
				)

				if (owner) return owner.user_id === userId ? 'linked' : 'in_use'

				const added = await tx.exec(
					sql`
						INSERT INTO identities (provider, subject, user_id, email)
						VALUES (${provider}, ${subject}, ${userId}, ${email})
						ON CONFLICT DO NOTHING
					`,
				)

				return added ? 'linked' : 'provider_linked'
			})
		},

		async getIdentities(userId) {
			return db.many<LinkedIdentity>(
				sql`
					SELECT provider, email, created_at FROM identities
					WHERE user_id = ${userId}
					ORDER BY provider
				`,
			)
		},

		async unlinkIdentity(userId, provider) {
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

				if (!user || !identity) return 'not_found'

				const others = await tx.val<number>(
					sql`
						SELECT
							(SELECT count(*) FROM identities WHERE user_id = ${userId} AND provider <> ${provider})::int
							+ (SELECT count(*) FROM passkeys WHERE user_id = ${userId})::int
					`,
				)

				if (!user.has_password && others === 0) return 'last_sign_in'

				await tx.exec(
					sql`DELETE FROM identities WHERE user_id = ${userId} AND provider = ${provider}`,
				)

				return 'deleted'
			})
		},
	}
}
