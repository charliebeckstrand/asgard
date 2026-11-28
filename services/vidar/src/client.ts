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
	/** Names the calling service on each event it reports. */
	service: string
	/** The breaker logs its transitions here, under the caller's own binding. */
	logger: Logger
}

type VidarClient = ReturnType<typeof hc<VidarApp>>

interface Vidar {
	client: VidarClient
	breaker: CircuitBreaker
	service: string
}

let vidar: Vidar | null = null

export function configure(config: VidarClientConfig): void {
	vidar = config.vidarUrl
		? {
				client: hc<VidarApp>(config.vidarUrl, {
					headers: config.vidarApiKey
						? { Authorization: `Bearer ${config.vidarApiKey}` }
						: undefined,
				}),
				breaker: createCircuitBreaker('vidar', { logger: config.logger }),
				service: config.service,
			}
		: null
}

/** A ban check holds up the request it guards, so it gives up sooner. */
const BAN_CHECK_TIMEOUT_MS = 3000
const TIMEOUT_MS = 5000

function timeout(ms = TIMEOUT_MS) {
	return { init: { signal: AbortSignal.timeout(ms) } }
}

/**
 * A 5xx, or a 401 or 403 from a wrong API key, is Vidar failing rather than
 * answering, so it counts toward opening the breaker, which logs it.
 */
function isVidarFault(status: number): boolean {
	return status >= 500 || status === 401 || status === 403
}

/**
 * Runs a call against Vidar through the circuit breaker. Rejects when Vidar
 * isn't configured, the breaker is open, or the call throws.
 */
async function callVidar<T>(fn: (vidar: Vidar) => Promise<T>): Promise<T> {
	const current = vidar

	if (!current) throw new Error('Vidar is not configured')

	return current.breaker.execute(() => fn(current))
}

/**
 * For the admin pages, which fail closed: an admin must see that Vidar is
 * unconfigured, down or answering nonsense, so each of those is a 503.
 */
async function askVidar<T>(fn: (vidar: Vidar) => Promise<T>): Promise<T> {
	try {
		return await callVidar(fn)
	} catch {
		throw new HTTPException(503, { message: 'Security monitoring is unavailable' })
	}
}

/** Null when Vidar can't answer, so the caller fails open. */
async function checkIpBan(ip: string): Promise<CheckIpResponse | null> {
	return callVidar(async ({ client }) => {
		const res = await client.vidar['check-ip'].$get(
			{ query: { ip } },
			timeout(BAN_CHECK_TIMEOUT_MS),
		)

		if (isVidarFault(res.status)) throw new Error(`Vidar returned ${res.status}`)
		if (!res.ok) return null

		const parsed = CheckIpResponseSchema.safeParse(await res.json())

		return parsed.success ? parsed.data : null
	}).catch(() => null)
}

/**
 * Reports a security event to Vidar. Fire-and-forget: it never throws, and a
 * Vidar outage only loses the event.
 */
export function reportEvent(event: {
	type: string
	ip: string
	details?: Record<string, unknown>
}): void {
	callVidar(async ({ client, service }) => {
		const res = await client.vidar.events.$post(
			{
				json: { ip: event.ip, event_type: event.type, details: event.details ?? {}, service },
			},
			timeout(),
		)

		if (isVidarFault(res.status)) throw new Error(`Vidar returned ${res.status}`)
	}).catch(() => {})
}

/** The newest threats, optionally only resolved or only open ones. */
export function listThreats(resolved?: boolean): Promise<ThreatList> {
	return askVidar(async ({ client }) => {
		const query = resolved === undefined ? {} : { resolved: String(resolved) }
		const res = await client.vidar.threats.$get({ query }, timeout())

		if (!res.ok) throw new Error(`Vidar returned ${res.status}`)

		return ThreatListSchema.parse(await res.json())
	})
}

/** Marks a threat handled, or reopens it. Null when there is no such threat. */
export function resolveThreat(id: string, resolved: boolean): Promise<Threat | null> {
	return askVidar(async ({ client }) => {
		const res = await client.vidar.threats[':id'].$patch(
			{ param: { id }, json: { resolved } },
			timeout(),
		)

		if (res.status === 404) return null
		if (!res.ok) throw new Error(`Vidar returned ${res.status}`)

		return ThreatSchema.parse(await res.json())
	})
}

/** The bans in force. */
export function listBans(): Promise<BanList> {
	return askVidar(async ({ client }) => {
		const res = await client.vidar.bans.$get({}, timeout())

		if (!res.ok) throw new Error(`Vidar returned ${res.status}`)

		return BanListSchema.parse(await res.json())
	})
}

/** Lifts the ban on `ip`. False when it wasn't banned. */
export function removeBan(ip: string): Promise<boolean> {
	return askVidar(async ({ client }) => {
		const res = await client.vidar.bans[':ip'].$delete({ param: { ip } }, timeout())

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
