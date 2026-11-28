import { type Queryable, sql } from 'saga'
import type { RuleSeverity } from 'skuld'
import { db } from '../lib/db.js'
import { logger } from '../lib/log.js'
import { banForAtLeast } from './bans.js'
import { createThreat } from './threats.js'

export interface Rule {
	id: string
	name: string
	event_type: string
	threshold: number
	window_minutes: number
	ban_duration_minutes: number
	severity: RuleSeverity
	/** For credential stuffing: minimum distinct accounts targeted */
	distinct_accounts?: number
}

export const RULES: Rule[] = [
	{
		id: 'brute_force',
		name: 'Brute Force Detection',
		event_type: 'login_failed',
		threshold: 10,
		window_minutes: 15,
		ban_duration_minutes: 60,
		severity: 'medium',
	},
	{
		id: 'registration_spam',
		name: 'Registration Spam Detection',
		event_type: 'registration',
		threshold: 5,
		window_minutes: 30,
		ban_duration_minutes: 1440,
		severity: 'high',
	},
	{
		id: 'rate_limit_abuse',
		name: 'Rate Limit Abuse Detection',
		event_type: 'rate_limited',
		threshold: 20,
		window_minutes: 10,
		ban_duration_minutes: 120,
		severity: 'medium',
	},
	{
		id: 'credential_stuffing',
		name: 'Credential Stuffing Detection',
		event_type: 'login_failed',
		threshold: 15,
		window_minutes: 30,
		ban_duration_minutes: 1440,
		severity: 'high',
		distinct_accounts: 10,
	},
]

function formatDuration(minutes: number): string {
	if (minutes >= 60) {
		const hours = Math.floor(minutes / 60)

		return `${hours}h`
	}

	return `${minutes}m`
}

/**
 * Runs the rules that watch `eventType` for `ip`. One address's rules run one
 * at a time, behind a lock held to the end of the transaction, so two events
 * can't both pass a count, or overwrite each other's bans, before either
 * records its threat.
 */
export async function evaluateRules(ip: string, eventType: string): Promise<void> {
	const matchingRules = RULES.filter((r) => r.event_type === eventType)

	if (matchingRules.length === 0) return

	await db.tx(async (tx) => {
		await tx.exec(sql`SELECT pg_advisory_xact_lock(hashtext(${ip}))`)

		for (const rule of matchingRules) {
			if (!(await ruleTriggered(tx, ip, rule))) continue

			const banned = await banForAtLeast(tx, ip, rule.ban_duration_minutes, {
				reason: rule.name,
				rule_id: rule.id,
			})

			await createThreat(tx, {
				threat_type: rule.id,
				severity: rule.severity,
				ip,
				details: { rule_id: rule.id, rule_name: rule.name },
				action_taken: banned
					? `Banned for ${formatDuration(rule.ban_duration_minutes)}`
					: 'Already banned for longer',
			})

			logger().warn(
				{
					ruleId: rule.id,
					ruleName: rule.name,
					ip,
					banDurationMinutes: banned ? rule.ban_duration_minutes : undefined,
				},
				'rule triggered',
			)
		}
	})
}

/**
 * Counts matching events inside the rule's window, ignoring events already
 * counted towards an earlier trigger of the same rule (its latest threat),
 * so one burst can't trigger the rule again once a ban expires.
 */
async function ruleTriggered(q: Queryable, ip: string, rule: Rule): Promise<boolean> {
	const row = await q.one<{ event_count: number; account_count: number }>(
		sql`SELECT
			COUNT(*)::int AS event_count,
			COUNT(DISTINCT account)::int AS account_count
		 FROM vdr_security_events
		 WHERE ip = ${ip}
		   AND event_type = ${rule.event_type}
		   AND created_at > now() - make_interval(mins => ${rule.window_minutes}::int)
		   AND created_at > COALESCE(
		     (SELECT max(created_at) FROM vdr_threats WHERE ip = ${ip} AND threat_type = ${rule.id}),
		     '-infinity'
		   )`,
	)

	if (row.event_count < rule.threshold) return false

	if (rule.distinct_accounts && row.account_count < rule.distinct_accounts) return false

	return true
}
