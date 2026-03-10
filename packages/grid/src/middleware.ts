import type { Context } from 'hono'
import { getConnInfo } from 'hono/cloudflare-workers'

export function getIpAddress(c: Context): string {
	const info = getConnInfo(c)

	return info.remote.address ?? 'unknown'
}
