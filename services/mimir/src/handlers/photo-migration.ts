import { logger } from '../lib/log.js'
import { newPhotoKey, putPhoto } from '../lib/storage.js'
import { changeDocument, documentOwners } from './documents.js'
import { records, upgradePlace } from './travel.js'

/**
 * Visits saved before photo uploads kept each photo as a web address. This
 * copies each such photo into the bucket and stores its key instead, so only
 * keys remain. Run once after the deploy that brought keys; running it again
 * finds nothing left to copy, apart from photos that failed for a reason that
 * may pass.
 */

/** The image types a copied photo can be, with each one's extension. */
const COPY_TYPES: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/avif': 'avif',
}

/** The largest photo copied, well past a camera's, so one can't fill the memory. */
const MAX_COPY_BYTES = 50 * 1024 * 1024

/**
 * What became of one photo: copied under a key, dropped because the address
 * holds no image anymore, or kept for a later run.
 */
type Copy = { key: string } | { dropped: string } | { kept: string }

/** Whether the address's answer means it holds no image and never will. */
function isGone(status: number): boolean {
	return status >= 400 && status < 500 && status !== 408 && status !== 429
}

async function copyPhoto(userId: string, address: string): Promise<Copy> {
	let res: Response

	try {
		res = await fetch(address, { signal: AbortSignal.timeout(30_000) })
	} catch (err) {
		return { kept: `unreachable: ${err instanceof Error ? err.message : String(err)}` }
	}

	if (isGone(res.status)) return { dropped: `status ${res.status}` }

	if (!res.ok) return { kept: `status ${res.status}` }

	// Only images are copied, so a photo address can't copy any other kind of
	// answer into the bucket.
	const type = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''

	const extension = COPY_TYPES[type]

	if (!extension) return { dropped: `not an image: ${type || 'no type'}` }

	if (Number(res.headers.get('content-length') ?? 0) > MAX_COPY_BYTES) {
		return { kept: 'too large' }
	}

	const body = new Uint8Array(await res.arrayBuffer())

	if (body.byteLength > MAX_COPY_BYTES) return { kept: 'too large' }

	const key = newPhotoKey(userId, extension)

	// A bucket that refuses the write keeps the address for a later run, rather
	// than failing the deploy that runs this.
	try {
		await putPhoto(key, body, type)
	} catch (err) {
		return { kept: `bucket refused: ${err instanceof Error ? err.message : String(err)}` }
	}

	return { key }
}

type Tally = { copied: number; dropped: number; kept: number }

/** Copies the web-address photos of one user's places, under the lock on their places. */
function migrateUser(userId: string, tally: Tally): Promise<void> {
	const log = logger()

	return changeDocument(userId, 'places', async (document) => {
		let changed = false

		const migrated: unknown[] = []

		for (const record of records(document)) {
			const place = upgradePlace(record) as { visits?: unknown }

			if (!Array.isArray(place?.visits)) {
				migrated.push(record)

				continue
			}

			const visits: unknown[] = []

			for (const visit of place.visits as { photos?: unknown }[]) {
				if (!Array.isArray(visit?.photos)) {
					visits.push(visit)

					continue
				}

				const photos: unknown[] = []

				for (const photo of visit.photos) {
					if (typeof photo !== 'string' || !/^https?:\/\//.test(photo)) {
						photos.push(photo)

						continue
					}

					const copy = await copyPhoto(userId, photo)

					if ('key' in copy) {
						photos.push(copy.key)

						changed = true

						tally.copied++
					} else if ('dropped' in copy) {
						log.warn({ userId, photo, reason: copy.dropped }, 'photo dropped')

						changed = true

						tally.dropped++
					} else {
						log.warn({ userId, photo, reason: copy.kept }, 'photo not copied')

						photos.push(photo)

						tally.kept++
					}
				}

				visits.push({ ...visit, photos })
			}

			migrated.push({ ...place, visits })
		}

		return { result: undefined, value: changed ? migrated : undefined }
	})
}

/** Copies every user's web-address photos into the bucket. */
export async function migratePhotos(): Promise<Tally> {
	const tally: Tally = { copied: 0, dropped: 0, kept: 0 }

	for (const userId of await documentOwners('places')) await migrateUser(userId, tally)

	return tally
}
