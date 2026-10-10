import { logger } from '../lib/log.js'
import { deletePhotos, listPhotos } from '../lib/storage.js'
import { changeDocuments } from './documents.js'

/**
 * The one path that deletes photos. Once a day it deletes each object more
 * than a day old that no visit or trip holds, which covers photos a write
 * dropped, deleted records and accounts, and uploads that were never saved.
 *
 * Three things keep a save that runs alongside it whole:
 *
 * - Midgard uploads a photo seconds before the save that holds it, so an
 *   object a save in progress uses is minutes old, and the sweep skips it.
 * - The sweep reads which keys a user's places and trips hold, and deletes the
 *   rest, under the lock every write of places and trips takes. A save waits
 *   for it, or it waits for the save.
 * - A save that adds a key checks the object is there (`changeTravel`), so a
 *   draft opened before the sweep can't store a photo it deleted.
 */

/** How old an object must be before the sweep deletes it. */
const MIN_AGE_MS = 24 * 60 * 60 * 1000

/** How long the sweep holds a user's lock to delete, so a save waits at most this. */
const DELETE_TIMEOUT_MS = 10_000

/** `users/{userId}/{file}`, with the user's id, a uuid like the documents' `user_id`. */
const KEY_PATTERN = /^users\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[^/]+$/

/**
 * Every string in the documents. The sweep keeps an object whose key is any of
 * them, rather than reading the photo fields, so a record the schema can't
 * read, or a later field that holds keys, still keeps its photos.
 */
function heldStrings(value: unknown, held = new Set<string>()): Set<string> {
	if (typeof value === 'string') held.add(value)
	else if (Array.isArray(value)) for (const item of value) heldStrings(item, held)
	else if (typeof value === 'object' && value !== null) {
		for (const item of Object.values(value)) heldStrings(item, held)
	}

	return held
}

type Tally = {
	listed: number
	old: number
	candidates: number
	deleted: number
	kept: number
	errors: number
}

/**
 * Sweeps the bucket. With `deletes` off it only logs what it would delete. A
 * failure for one user deletes nothing more of theirs and moves on; the next
 * run tries again.
 */
export async function sweepPhotos({ deletes }: { deletes: boolean }): Promise<Tally> {
	const log = logger()

	const objects = await listPhotos()

	const cutoff = Date.now() - MIN_AGE_MS

	const tally: Tally = {
		listed: objects.length,
		old: 0,
		candidates: 0,
		deleted: 0,
		kept: 0,
		errors: 0,
	}

	const oldByUser = new Map<string, string[]>()

	for (const { key, modified } of objects) {
		if (modified.getTime() >= cutoff) continue

		tally.old++

		const userId = KEY_PATTERN.exec(key)?.[1]

		if (userId === undefined) {
			log.warn({ key }, 'photo sweep skipped a key it cannot read')

			continue
		}

		oldByUser.set(userId, [...(oldByUser.get(userId) ?? []), key])
	}

	for (const [userId, old] of oldByUser) {
		try {
			await changeDocuments(userId, ['places', 'trips'], async (documents) => {
				const held = heldStrings(documents)

				const candidates = old.filter((key) => !held.has(key))

				tally.kept += old.length - candidates.length

				tally.candidates += candidates.length

				if (!deletes) {
					for (const key of candidates) log.info({ userId, key }, 'photo sweep would delete')

					return { result: undefined, values: [] }
				}

				const failed = await deletePhotos(candidates, AbortSignal.timeout(DELETE_TIMEOUT_MS))

				const failedKeys = new Set(failed.map(({ key }) => key))

				for (const { key, err } of failed) {
					log.error({ err, userId, key }, 'photo sweep failed to delete')
				}

				for (const key of candidates) {
					if (!failedKeys.has(key)) log.info({ userId, key }, 'photo sweep deleted')
				}

				tally.deleted += candidates.length - failed.length

				tally.errors += failed.length

				return { result: undefined, values: [] }
			})
		} catch (err) {
			log.error({ err, userId }, 'photo sweep failed for a user')

			tally.errors++
		}
	}

	log.info({ ...tally, deletes }, 'photo sweep finished')

	return tally
}
