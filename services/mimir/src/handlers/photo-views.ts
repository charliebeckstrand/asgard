import { logger } from '../lib/log.js'
import { deletePhotos, keepPhoto, savedKey } from '../lib/storage.js'
import { changeDocuments, documentOwners } from './documents.js'
import { photoKeys, records, replaceKeys } from './travel.js'

/**
 * Photos saved before views kept a flat key, `users/{userId}/{photoId}.{ext}`,
 * and no view, so the apps show the original. This moves each such photo to
 * its saved key with its view beside it, stores the saved key, and deletes the
 * flat one. Run after each deploy; a later run finds nothing left to move,
 * apart from the photos a web address migration copied since.
 */

type Tally = { moved: number; missing: number }

/** Moves one user's flat photos, under the lock on their places and trips. */
async function migrateUser(userId: string, tally: Tally): Promise<void> {
	const moved = await changeDocuments(userId, ['places', 'trips'], async ([places, trips]) => {
		const keys = new Map<string, string>()

		for (const key of photoKeys(records(places), records(trips))) {
			if (savedKey(key) === key) continue

			if (await keepPhoto(key)) {
				keys.set(key, savedKey(key))
			} else {
				// The documents keep the key, which reads as before.
				logger().warn({ userId, key }, 'photo to move is missing')

				tally.missing++
			}
		}

		const write = (document: unknown) =>
			keys.size > 0 && document !== undefined ? replaceKeys(document, keys) : undefined

		return { result: [...keys.keys()], values: [write(places), write(trips)] }
	})

	tally.moved += moved.length

	if (moved.length === 0) return

	// The move stands either way. A flat photo left behind is only storage.
	await deletePhotos(moved).catch((err: unknown) => {
		logger().error({ err, userId, keys: moved }, 'photo delete failed')
	})
}

/** Moves every user's flat photos to saved keys with views. */
export async function migratePhotoViews(): Promise<Tally> {
	const tally: Tally = { moved: 0, missing: 0 }

	const owners = new Set([...(await documentOwners('places')), ...(await documentOwners('trips'))])

	for (const userId of owners) await migrateUser(userId, tally)

	return tally
}
