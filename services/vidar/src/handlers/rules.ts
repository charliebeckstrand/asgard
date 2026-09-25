import { sql } from 'saga'
import { db } from '../lib/db.js'
import { logger } from '../lib/log.js'
import type { RuleSeverity } from '../lib/schemas.js'
import { createBan, isIpBanned } from './bans.js'
import { createThreat } from './threats.js'

export interface Rule {
	id: string
	name: string
	description: string
	event_type: string
	threshold: number
	window_minutes: number
	ban_duration_minutes: number
	severity: RuleSeverity
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
		severity: 'medium',
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
		severity: 'high',
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
		severity: 'medium',
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
		severity: 'high',
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
	const matchingRules = PREDEFINED_RULES.filter((r) => r.enabled && r.event_type === eventType)

	for (const rule of matchingRules) {
		const triggered = await checkRule(ip, rule)

		if (!triggered) continue

		const banned = await banUnlessAlreadyLonger(ip, rule)

		await createThreat({
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
}

/**
 * Ban the IP for the rule's duration, unless an active ban already outlasts
 * it — a rule must never shorten a longer or permanent ban.
 */
async function banUnlessAlreadyLonger(ip: string, rule: Rule): Promise<boolean> {
	const current = await isIpBanned(ip)

	if (current.banned) {
		if (!current.expires_at) return false

		const ruleExpiry = Date.now() + rule.ban_duration_minutes * 60_000

		if (new Date(current.expires_at).getTime() >= ruleExpiry) return false
	}

	await createBan(ip, rule.name, {
		rule_id: rule.id,
		created_by: 'vidar',
		duration_minutes: rule.ban_duration_minutes,
	})

	return true
}

/**
 * Counts matching events inside the rule's window, ignoring events already
 * counted towards an earlier trigger of the same rule (its latest threat),
 * so one burst can't trigger the rule again once a ban expires.
 */
async function checkRule(ip: string, rule: Rule): Promise<boolean> {
	const row = await db.one<{ event_count: number; account_count: number }>(
		sql`SELECT
			COUNT(*)::int AS event_count,
			COUNT(DISTINCT details->>'email')::int AS account_count
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
