import type { Activity } from 'skuld'
import { getConfig } from './config.js'
import type { ActivityEntry } from './types.js'

const ACTIVITY_LIMIT = 50

const ACTIVITY_RETENTION_DAYS = 90

/** Records that something happened to an account. */
export function recordActivity(entry: ActivityEntry): Promise<void> {
	return getConfig().activityRepository.record(entry)
}

/** The user's latest activity, newest first. */
export function getActivity(userId: string): Promise<Activity[]> {
	return getConfig().activityRepository.listActivity(userId, ACTIVITY_LIMIT)
}

export function deleteOldActivity(): Promise<number> {
	return getConfig().activityRepository.deleteOldActivity(ACTIVITY_RETENTION_DAYS)
}
