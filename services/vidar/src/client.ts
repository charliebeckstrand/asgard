import { getIpAddress } from 'grid/middleware'
import type { MiddlewareHandler } from 'hono'
import { hc } from 'hono/client'
import { HTTPException } from 'hono/http-exception'
import type { Logger } from 'saga/log'
import {
	type BanList,
	BanListSchema,
	type CheckIpResponse,
	CheckIpResponseSchema,
	type Threat,
	type ThreatList,
	ThreatListSchema,
	ThreatSchema,
} from 'skuld'

import type { VidarApp } from './app.js'
import { type CircuitBreaker, createCircuitBreaker } from './circuit-breaker.js'

export interface VidarClientConfig {
	vidarUrl?: string
	vidarApiKey?: string
	/**
	 * When set, the circuit breaker reports state transitions through this
	 * logger instead of console.{warn,info}. Pass the consuming service's
	 * logger so breaker events share its `service` binding.
	 */
	logger?: Logger
}

type VidarClient = ReturnType<typeof hc<VidarApp>>

let _client: VidarClient | null = null
let _breaker: CircuitBreaker | null = null

export function configure(config: VidarClientConfig): void {
	_client = config.vidarUrl
		? hc<VidarApp>(config.vidarUrl, {
				headers: config.vidarApiKey ? { Authorization: `Bearer ${config.vidarApiKey}` } : undefined,
			})
		: null

	_breaker = config.vidarUrl ? createCircuitBreaker('vidar', { logger: config.logger }) : null
}

/**
 * A 5xx, or a 401 or 403 from a wrong API key, is Vidar failing rather than
 * answering, so it counts toward opening the breaker, which logs it.
 */
function isVidarFault(status: number): boolean {
	return status >= 500 || status === 401 || status === 403
}

/**
 * Run an HTTP call against Vidar through the circuit breaker.
 * Returns null when Vidar isn't configured, the breaker is open, or the
 * call throws — callers fail open so a Vidar outage can't lock them out.
 */
async function callVidar<T>(fn: (client: VidarClient) => Promise<T>): Promise<T | null> {
	const client = _client
	const breaker = _breaker

	if (!client || !breaker) return null

	try {
		return await breaker.execute(() => fn(client))
	} catch {
		return null
	}
}

async function checkIpBan(ip: string): Promise<CheckIpResponse | null> {
	return callVidar(async (client) => {
		const res = await client.vidar['check-ip'].$get(
			{ query: { ip } },
			{ init: { signal: AbortSignal.timeout(3000) } },
		)

		if (isVidarFault(res.status)) throw new Error(`Vidar returned ${res.status}`)
		if (!res.ok) return null

		const parsed = CheckIpResponseSchema.safeParse(await res.json())

		return parsed.success ? parsed.data : null
	})
}

/**
 * Report a security event to Vidar.
 * Fire-and-forget — does not throw on failure.
 * Uses circuit breaker to avoid hammering an unresponsive Vidar.
 */
export function reportEvent(
	eventType: string,
	ip: string,
	details: Record<string, unknown> = {},
	service = 'unknown',
): void {
	void callVidar(async (client) => {
		const res = await client.vidar.events.$post(
			{ json: { ip, event_type: eventType, details, service } },
			{ init: { signal: AbortSignal.timeout(5000) } },
		)

		if (isVidarFault(res.status)) throw new Error(`Vidar returned ${res.status}`)
	})
}

const ADMIN_TIMEOUT_MS = 5000

/**
 * Run a call for an admin page through the circuit breaker. Unlike
 * callVidar, it fails closed: an admin must see that Vidar is unconfigured,
 * down or answering nonsense, so each of those is a 503.
 */
async function askVidar<T>(fn: (client: VidarClient) => Promise<T>): Promise<T> {
	const client = _client
	const breaker = _breaker

	if (!client || !breaker) throw unavailable()

	try {
		return await breaker.execute(() => fn(client))
	} catch {
		throw unavailable()
	}
}

function unavailable(): HTTPException {
	return new HTTPException(503, { message: 'Security monitoring is unavailable' })
}

function init() {
	return { init: { signal: AbortSignal.timeout(ADMIN_TIMEOUT_MS) } }
}

/** The newest threats, optionally only resolved or only open ones. */
export function listThreats(resolved?: boolean): Promise<ThreatList> {
	return askVidar(async (client) => {
		const query = resolved === undefined ? {} : ({ resolved: resolved ? 'true' : 'false' } as const)
		const res = await client.vidar.threats.$get({ query }, init())

		if (!res.ok) throw new Error(`Vidar returned ${res.status}`)

		return ThreatListSchema.parse(await res.json())
	})
}

/** Marks a threat handled, or reopens it. Null when there is no such threat. */
export function resolveThreat(id: string, resolved: boolean): Promise<Threat | null> {
	return askVidar(async (client) => {
		const res = await client.vidar.threats[':id'].$patch(
			{ param: { id }, json: { resolved } },
			init(),
		)

		if (res.status === 404) return null
		if (!res.ok) throw new Error(`Vidar returned ${res.status}`)

		return ThreatSchema.parse(await res.json())
	})
}

/** The bans in force. */
export function listBans(): Promise<BanList> {
	return askVidar(async (client) => {
		const res = await client.vidar.bans.$get({}, init())

		if (!res.ok) throw new Error(`Vidar returned ${res.status}`)

		return BanListSchema.parse(await res.json())
	})
}

/** Lifts the ban on `ip`. False when it wasn't banned. */
export function removeBan(ip: string): Promise<boolean> {
	return askVidar(async (client) => {
		const res = await client.vidar.bans[':ip'].$delete({ param: { ip } }, init())

		if (res.status === 404) return false
		if (!res.ok) throw new Error(`Vidar returned ${res.status}`)

		return true
	})
}

/**
 * Middleware that answers 403 to addresses Vidar has banned. Fails open when
 * Vidar is unconfigured or unreachable. Needs grid's clientIp middleware.
 */
export function banCheck(): MiddlewareHandler {
	return async (c, next) => {
		const result = await checkIpBan(getIpAddress(c))

		if (result?.banned) {
			throw new HTTPException(403, { message: 'Unauthorized' })
		}

		await next()
	}
}
