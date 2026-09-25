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
	 * sent (e.g. `do-connecting-ip` on DigitalOcean App Platform). Only set it when
	 * every request reaches the app through that edge.
	 */
	header?: string
	/**
	 * Secret a trusted proxy (e.g. a server-side app in front of this one) sends in
	 * `x-proxy-secret`. Its `x-client-ip` is trusted only on requests carrying it.
	 */
	proxySecret?: string
}

const CLIENT_IP_HEADER = 'x-client-ip'

const PROXY_SECRET_HEADER = 'x-proxy-secret'

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
export function clientIp(options: ClientIpOptions = {}): MiddlewareHandler<ClientIpEnv> {
	const { header, proxySecret } = options

	return async (c, next) => {
		const proxied =
			proxySecret && timingSafeCompare(c.req.header(PROXY_SECRET_HEADER) ?? '', proxySecret)
				? validIp(c.req.header(CLIENT_IP_HEADER))
				: undefined

		const edge = header ? validIp(c.req.header(header)) : undefined

		c.set('clientIp', proxied ?? edge ?? socketAddress(c) ?? 'unknown')

		await next()
	}
}

/**
 * The client address that {@link clientIp} resolved, or the socket address when
 * the middleware is not installed.
 */
export function getIpAddress(c: Context): string {
	return c.get('clientIp') ?? socketAddress(c) ?? 'unknown'
}
