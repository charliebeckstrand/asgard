import type { Activity } from 'skuld'
import type { ActivityEntry } from '../lib/activity-repository.js'
import { activityRepository } from '../lib/repositories.js'

const ACTIVITY_LIMIT = 50

const ACTIVITY_RETENTION_DAYS = 90

/** Records that something happened to an account. */
export function recordActivity(entry: ActivityEntry): Promise<void> {
	return activityRepository.record(entry)
}

/** The user's latest activity, newest first. */
export function getActivity(userId: string): Promise<Activity[]> {
	return activityRepository.listActivity(userId, ACTIVITY_LIMIT)
}

export function deleteOldActivity(): Promise<number> {
	return activityRepository.deleteOldActivity(ACTIVITY_RETENTION_DAYS)
}
