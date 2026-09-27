import type { Context } from 'hono'
import { sendSecurityNotice } from '../auth/index.js'
import { appOrigin } from '../lib/app-origin.js'
import { logger } from '../lib/log.js'

/**
 * Emails the user that `change` happened to how they sign in. Sent in the
 * background, so a mail outage never fails the change itself.
 */
export function notifyOwner(c: Context, userId: string, change: string): void {
	sendSecurityNotice(userId, change, appOrigin(c)).catch((err: unknown) => {
		logger().error({ err }, 'failed to send a security notice')
	})
}
