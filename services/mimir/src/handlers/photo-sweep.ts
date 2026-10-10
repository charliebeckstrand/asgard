import { logger } from '../lib/log.js'
import { deletePhotos, listPhotos, photoOwner, REQUEST_TIMEOUT_MS } from '../lib/storage.js'
import { changeTravel } from './travel.js'

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

		const userId = photoOwner(key)

		if (userId === undefined) {
			log.warn({ key }, 'photo sweep skipped a key it cannot read')

			continue
		}

		const keys = oldByUser.get(userId) ?? []

		keys.push(key)

		oldByUser.set(userId, keys)
	}

	for (const [userId, old] of oldByUser) {
		try {
			// Through `changeTravel`, so the sweep holds the lock and reads the
			// documents every write of photos does. It writes nothing back.
			await changeTravel(userId, async (places, trips) => {
				const held = heldStrings([places, trips])

				const candidates = old.filter((key) => !held.has(key))

				tally.kept += old.length - candidates.length

				tally.candidates += candidates.length

				const failed = deletes
					? await deletePhotos(candidates, AbortSignal.timeout(REQUEST_TIMEOUT_MS))
					: []

				const errors = new Map(failed.map(({ key, err }) => [key, err]))

				for (const key of candidates) {
					if (!deletes) log.info({ userId, key }, 'photo sweep would delete')
					else if (errors.has(key)) {
						log.error({ err: errors.get(key), userId, key }, 'photo sweep failed to delete')
					} else log.info({ userId, key }, 'photo sweep deleted')
				}

				if (deletes) tally.deleted += candidates.length - failed.length

				tally.errors += failed.length

				return { result: undefined }
			})
		} catch (err) {
			log.error({ err, userId }, 'photo sweep failed for a user')

			tally.errors++
		}
	}

	log.info({ ...tally, deletes }, 'photo sweep finished')

	return tally
}
