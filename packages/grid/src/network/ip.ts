import { isIP } from 'node:net'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context, MiddlewareHandler } from 'hono'
import { timingSafeCompare } from '../auth/bearer.js'

export interface ClientIpEnv {
	Variables: {
		clientIp: string
	}
}

export interface ClientIpOptions {
	/**
	 * Header the edge sets to the client address, replacing any value the client
	 * sent (e.g. `do-connecting-ip` on DigitalOcean App Platform). Only use it when
	 * every request reaches the app through that edge.
	 */
	header: string
	/**
	 * Secret a trusted proxy in front of the app sends in `x-client-ip-secret`.
	 * Its `x-client-ip` is trusted only on requests carrying it.
	 */
	secret?: string
}

const CLIENT_IP_HEADER = 'x-client-ip'

const CLIENT_IP_SECRET_HEADER = 'x-client-ip-secret'

function socketAddress(c: Context): string | undefined {
	try {
		return getConnInfo(c).remote.address
	} catch {
		return undefined
	}
}

function validIp(value: string | undefined): string | undefined {
	const ip = value?.trim()

	return ip && isIP(ip) ? ip : undefined
}

/**
 * Hono middleware that resolves the client address once per request, for
 * {@link getIpAddress}. In order of trust: a trusted proxy's `x-client-ip`, the
 * edge's `header`, then the socket address. A header that is missing or not an
 * IP falls through to the next source.
 */
export function clientIp({ header, secret }: ClientIpOptions): MiddlewareHandler<ClientIpEnv> {
	return async (c, next) => {
		const proxied =
			secret && timingSafeCompare(c.req.header(CLIENT_IP_SECRET_HEADER) ?? '', secret)
				? validIp(c.req.header(CLIENT_IP_HEADER))
				: undefined

		c.set('clientIp', proxied ?? validIp(c.req.header(header)) ?? socketAddress(c) ?? 'unknown')

		await next()
	}
}

/**
 * The client address that {@link clientIp} resolved. Throws when the middleware
 * is not installed, so an app can't silently key on the wrong address.
 */
export function getIpAddress(c: Context): string {
	const ip: string | undefined = c.get('clientIp')

	if (!ip) throw new Error('getIpAddress needs the clientIp middleware')

	return ip
}
