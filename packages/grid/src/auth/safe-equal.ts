import { hash, timingSafeEqual } from 'node:crypto'

/**
 * Compares two secrets in constant time. Comparing their digests keeps the
 * lengths equal, so the time taken says nothing about either, length included.
 */
export function safeEqual(a: string, b: string): boolean {
	return timingSafeEqual(hash('sha256', a, 'buffer'), hash('sha256', b, 'buffer'))
}
