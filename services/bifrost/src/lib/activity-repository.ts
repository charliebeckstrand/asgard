import { type Db, sql } from 'saga'
import type { Activity, ActivityAction } from 'skuld'

/** One thing that happened to an account, as it is recorded. */
export interface ActivityEntry {
	userId: string
	/** Who did it: the user, an admin, or null for the operator. */
	actorId: string | null
	action: ActivityAction
	detail?: string
	ip?: string
}

export function createActivityRepository(db: Db) {
	return {
		async record({ userId, actorId, action, detail, ip }: ActivityEntry) {
			await db.exec(
				sql`
					INSERT INTO activity (user_id, actor_id, action, detail, ip)
					VALUES (${userId}, ${actorId}, ${action}, ${detail ?? null}, ${ip ?? null})
				`,
			)
		},

		/** The user's latest entries, newest first. */
		async listActivity(userId: string, limit: number) {
			return db.many<Activity>(
				sql`
					SELECT id, action, detail, actor_id, host(ip) AS ip, created_at
					FROM activity
					WHERE user_id = ${userId}
					ORDER BY created_at DESC, id DESC
					LIMIT ${limit}
				`,
			)
		},

		/** Deletes the entries older than `days`. */
		async deleteOldActivity(days: number) {
			return db.exec(
				sql`DELETE FROM activity WHERE created_at <= now() - make_interval(days => ${days})`,
			)
		},
	}
}

export type ActivityRepository = ReturnType<typeof createActivityRepository>
