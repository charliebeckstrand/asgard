import { getIpAddress } from 'grid/middleware'
import type { Context } from 'hono'
import type { ActivityAction } from 'skuld'
import { recordActivity, sendSecurityNotice } from '../auth/index.js'
import type { ActivityEntry } from '../auth/types.js'
import { appOrigin } from '../lib/app-origin.js'
import { logger } from '../lib/log.js'

/**
 * Records that `action` happened to an account, with the request's IP. The
 * action already happened, so a failure to record it is logged and never fails
 * the request.
 */
export async function record(c: Context, entry: Omit<ActivityEntry, 'ip'>): Promise<void> {
	try {
		await recordActivity({ ...entry, ip: getIpAddress(c) })
	} catch (err) {
		logger().error({ err, action: entry.action }, 'failed to record activity')
	}
}

/**
 * Records a change the user made to how they sign in, and emails them `notice`,
 * such as "A passkey was added to your account", so a change they did not make
 * never goes unseen. The email goes in the background, so a mail outage never
 * fails the change itself.
 */
export async function recordChange(
	c: Context,
	userId: string,
	action: ActivityAction,
	notice: string,
	detail?: string,
): Promise<void> {
	await record(c, { userId, actorId: userId, action, detail })

	sendSecurityNotice(userId, notice, appOrigin(c)).catch((err: unknown) => {
		logger().error({ err }, 'failed to send a security notice')
	})
}
