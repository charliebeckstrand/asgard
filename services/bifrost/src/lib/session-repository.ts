import { sql } from 'saga'
import type { SessionRepository, SessionRow, SessionUser } from '../auth/types.js'
import { db } from './db.js'

export function createSessionRepository(): SessionRepository {
	return {
		async createSession(id, userId, refreshJti, expiresAt) {
			await db.tx(async (tx) => {
				// Prune this user's dead sessions so the table doesn't grow with every login.
				await tx.exec(
					sql`
						DELETE FROM sessions
						WHERE user_id = ${userId}
						AND (expires_at < now() OR revoked_at IS NOT NULL)
					`,
				)

				await tx.exec(
					sql`
						INSERT INTO sessions (id, user_id, refresh_jti, expires_at)
						VALUES (${id}, ${userId}, ${refreshJti}, ${expiresAt})
					`,
				)
			})
		},

		async getSession(id) {
			return db.first<SessionRow>(
				sql`
					SELECT id, user_id, refresh_jti, previous_jti, rotated_at, expires_at, revoked_at
					FROM sessions
					WHERE id = ${id}
				`,
			)
		},

		async getSessionUser(id) {
			return db.first<SessionUser>(
				sql`
					SELECT u.id, u.role
					FROM sessions s
					JOIN users u ON u.id = s.user_id
					WHERE s.id = ${id}
					AND s.revoked_at IS NULL
					AND s.expires_at > now()
					AND u.is_active
				`,
			)
		},

		async rotateSession(id, currentJti, nextJti, expiresAt) {
			const count = await db.exec(
				sql`
					UPDATE sessions
					SET previous_jti = refresh_jti,
						refresh_jti = ${nextJti},
						rotated_at = now(),
						expires_at = ${expiresAt}
					WHERE id = ${id}
					AND refresh_jti = ${currentJti}
					AND revoked_at IS NULL
					AND expires_at > now()
				`,
			)

			return count > 0
		},

		async revokeSession(id) {
			await db.exec(
				sql`UPDATE sessions SET revoked_at = now() WHERE id = ${id} AND revoked_at IS NULL`,
			)
		},

		async revokeUserSessions(userId) {
			await db.exec(
				sql`
					UPDATE sessions
					SET revoked_at = now()
					WHERE user_id = ${userId}
					AND revoked_at IS NULL
				`,
			)
		},
	}
}
