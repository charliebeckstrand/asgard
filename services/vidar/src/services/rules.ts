import { sql } from 'mimir'
import { getDb } from '../lib/db.js'
import { createBan } from './bans.js'
import { createThreat } from './threats.js'

export interface Rule {
	id: string
	name: string
	description: string
	event_type: string
	threshold: number
	window_minutes: number
	ban_duration_minutes: number
	enabled: boolean
	/** For credential stuffing: minimum distinct accounts targeted */
	distinct_accounts?: number
}

const PREDEFINED_RULES: Rule[] = [
	{
		id: 'brute_force',
		name: 'Brute Force Detection',
		description: 'Bans IP after repeated failed login attempts',
		event_type: 'login_failed',
		threshold: 10,
		window_minutes: 15,
		ban_duration_minutes: 60,
		enabled: true,
	},
	{
		id: 'registration_spam',
		name: 'Registration Spam Detection',
		description: 'Bans IP after excessive registration attempts',
		event_type: 'registration',
		threshold: 5,
		window_minutes: 30,
		ban_duration_minutes: 1440,
		enabled: true,
	},
	{
		id: 'rate_limit_abuse',
		name: 'Rate Limit Abuse Detection',
		description: 'Bans IP after repeated rate limit violations',
		event_type: 'rate_limited',
		threshold: 20,
		window_minutes: 10,
		ban_duration_minutes: 120,
		enabled: true,
	},
	{
		id: 'credential_stuffing',
		name: 'Credential Stuffing Detection',
		description: 'Bans IP after failed logins across many distinct accounts',
		event_type: 'login_failed',
		threshold: 15,
		window_minutes: 30,
		ban_duration_minutes: 1440,
		enabled: true,
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

export function getRules(): Rule[] {
	return PREDEFINED_RULES
}

export async function evaluateRules(ip: string, eventType: string): Promise<void> {
	const knownIp = ip && ip !== 'unknown' ? ip : null

	const matchingRules = PREDEFINED_RULES.filter((r) => r.enabled && r.event_type === eventType)

	for (const rule of matchingRules) {
		const triggered = await checkRule(ip, rule)

		if (triggered) {
			await createBan(ip, rule.name, {
				rule_id: rule.id,
				created_by: 'vidar',
				duration_minutes: rule.ban_duration_minutes,
			})

			await createThreat({
				threat_type: rule.id,
				severity: rule.ban_duration_minutes >= 1440 ? 'high' : 'medium',
				ip,
				details: { rule_id: rule.id, rule_name: rule.name },
				action_taken: `Banned for ${formatDuration(rule.ban_duration_minutes)}`,
			})

			const ipPart = knownIp ? ` for IP ${knownIp}` : ''

			console.log(
				`[vidar] Rule "${rule.id}" triggered${ipPart} — banned for ${formatDuration(rule.ban_duration_minutes)}`,
			)
		}
	}
}

async function checkRule(ip: string, rule: Rule): Promise<boolean> {
	const db = getDb()

	if (rule.distinct_accounts) {
		const row = await db.first<{ event_count: string; account_count: string }>(
			sql`SELECT
				COUNT(*)::text AS event_count,
				COUNT(DISTINCT details->>'email')::text AS account_count
			 FROM vdr_security_events
			 WHERE ip = ${ip}
			   AND event_type = ${rule.event_type}
			   AND created_at > now() - make_interval(mins => ${rule.window_minutes}::int)`,
		)

		const eventCount = Number.parseInt(row.event_count, 10)

		const accountCount = Number.parseInt(row.account_count, 10)

		return eventCount >= rule.threshold && accountCount >= rule.distinct_accounts
	}

	const count = await db.val<string>(
		sql`SELECT COUNT(*)::text FROM vdr_security_events
		 WHERE ip = ${ip}
		   AND event_type = ${rule.event_type}
		   AND created_at > now() - make_interval(mins => ${rule.window_minutes}::int)`,
	)

	return Number.parseInt(count, 10) >= rule.threshold
}
