import { sql } from 'saga'
import type { Session, UserRole } from 'skuld'
import type { SessionRepository } from '../auth/types.js'
import { db } from './db.js'

interface SessionRow {
	id: string
	created_at: string
	expires_at: string
	user_id: string
	email: string
	is_active: boolean
	is_verified: boolean
	role: UserRole
	user_created_at: string
	user_updated_at: string
}

const selectSession = sql`
	SELECT s.id, s.created_at, s.expires_at,
		u.id AS user_id, u.email, u.is_active, u.is_verified, u.role,
		u.created_at AS user_created_at, u.updated_at AS user_updated_at
	FROM sessions s
	JOIN users u ON u.id = s.user_id
`

function toSession(row: SessionRow): Session {
	return {
		id: row.id,
		created_at: row.created_at,
		expires_at: row.expires_at,
		user: {
			id: row.user_id,
			email: row.email,
			is_active: row.is_active,
			is_verified: row.is_verified,
			role: row.role,
			created_at: row.user_created_at,
			updated_at: row.user_updated_at,
		},
	}
}

export function createSessionRepository(): SessionRepository {
	return {
		async createSession(id, userId, expiresAt, { replacing, limit }) {
			return db.tx(async (tx) => {
				// Serializes concurrent sign-ins of one user, so the cap holds.
				await tx.exec(sql`SELECT 1 FROM users WHERE id = ${userId} FOR UPDATE`)

				if (replacing) {
					await tx.exec(sql`DELETE FROM sessions WHERE id = ${replacing}`)
				}

				await tx.exec(
					sql`
						INSERT INTO sessions (id, user_id, expires_at)
						VALUES (${id}, ${userId}, ${expiresAt})
					`,
				)

				await tx.exec(
					sql`
						DELETE FROM sessions
						WHERE user_id = ${userId}
						AND id NOT IN (
							SELECT id FROM sessions
							WHERE user_id = ${userId} AND expires_at > now()
							ORDER BY created_at DESC, id
							LIMIT ${limit}
						)
					`,
				)

				return toSession(await tx.one<SessionRow>(sql`${selectSession} WHERE s.id = ${id}`))
			})
		},

		async findSession(id) {
			const row = await db.first<SessionRow>(
				sql`${selectSession} WHERE s.id = ${id} AND s.expires_at > now() AND u.is_active`,
			)

			return row ? toSession(row) : null
		},

		async deleteSession(id) {
			await db.exec(sql`DELETE FROM sessions WHERE id = ${id}`)
		},

		async deleteUserSessions(userId, options) {
			const except = options?.except ? sql`AND id <> ${options.except}` : sql``

			await db.exec(sql`DELETE FROM sessions WHERE user_id = ${userId} ${except}`)
		},

		async deleteExpiredSessions() {
			return db.exec(sql`DELETE FROM sessions WHERE expires_at <= now()`)
		},
	}
}
