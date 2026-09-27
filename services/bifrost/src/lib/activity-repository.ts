import { type Db, sql } from 'saga'
import type { Activity } from 'skuld'
import type { ActivityRepository } from '../auth/types.js'

export function createActivityRepository(db: Db): ActivityRepository {
	return {
		async record({ userId, actorId, action, detail, ip }) {
			await db.exec(
				sql`
					INSERT INTO activity (user_id, actor_id, action, detail, ip)
					VALUES (${userId}, ${actorId}, ${action}, ${detail ?? null}, ${ip ?? null})
				`,
			)
		},

		async listActivity(userId, limit) {
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

		async deleteOldActivity(days) {
			return db.exec(
				sql`DELETE FROM activity WHERE created_at <= now() - make_interval(days => ${days})`,
			)
		},
	}
}
