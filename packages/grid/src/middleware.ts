import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'

export function getIpAddress(c: Context): string {
	const info = getConnInfo(c)

	return info.remote.address ?? 'unknown'
}
