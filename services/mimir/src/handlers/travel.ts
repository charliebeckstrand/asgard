import { DataError } from '../lib/errors.js'
import { logger } from '../lib/log.js'
import {
	type Photo,
	type Place,
	type StoredPlace,
	StoredPlaceSchema,
	type StoredTrip,
	StoredTripSchema,
	type Trip,
} from '../lib/schemas.js'
import {
	deletePhotos,
	isOwnPhoto,
	isUpload,
	keepPhoto,
	photoUrl,
	savedKey,
	viewKey,
} from '../lib/storage.js'
import { changeDocuments } from './documents.js'

/**
 * What places and trips share. A visit can name a trip, so a write of either
 * reads both documents under one lock, and the rules between them hold. Each
 * write also keeps the photos it adds and deletes the ones it leaves unused.
 */

/** The stored records of a document, or none where it doesn't exist yet. */
export function records(document: unknown): unknown[] {
	return Array.isArray(document) ? document : []
}

/** Whether a stored record carries this id, whether or not the rest of it reads. */
export function hasId(record: unknown, id: string): boolean {
	return typeof record === 'object' && record !== null && (record as { id?: unknown }).id === id
}

/**
 * A stored place record in the shape the schema reads.
 *
 * A place stored before visits kept one visit in its own fields: `visitedAt`,
 * `rating`, `review` and `photo`. Such a record reads as a place with that one
 * visit, under the id of the place. The next write of the place stores the new
 * shape.
 */
export function upgradePlace(record: unknown): unknown {
	if (typeof record !== 'object' || record === null || 'visits' in record) return record

	const { visitedAt, rating, review, photo, ...place } = record as Record<string, unknown>

	return {
		...place,
		visits: [
			{ id: place.id, visitedAt, rating, review, photos: photo === undefined ? [] : [photo] },
		],
	}
}

/** The stored place under a record, or `undefined` where the record doesn't read as one. */
export function readPlace(record: unknown): StoredPlace | undefined {
	const parsed = StoredPlaceSchema.safeParse(upgradePlace(record))

	return parsed.success ? parsed.data : undefined
}

/** The stored trip under a record, or `undefined` where the record doesn't read as one. */
export function readTrip(record: unknown): StoredTrip | undefined {
	const parsed = StoredTripSchema.safeParse(record)

	return parsed.success ? parsed.data : undefined
}

/** Whether a stored photo is the web address of one saved before keys. */
function isWebAddress(photo: string): boolean {
	return /^https?:\/\//.test(photo)
}

/** Every photo key the places and trips use. */
export function photoKeys(places: unknown[], trips: unknown[]): Set<string> {
	const keys = new Set<string>()

	for (const place of places.map(readPlace)) {
		for (const visit of place?.visits ?? []) for (const photo of visit.photos) keys.add(photo)
	}

	for (const trip of trips.map(readTrip)) for (const photo of trip?.photos ?? []) keys.add(photo)

	for (const key of keys) if (isWebAddress(key)) keys.delete(key)

	return keys
}

/** What a change of places and trips gives back: the result, and each new document. */
type TravelChange<T> = { result: T; places?: unknown[]; trips?: unknown[] }

/** The value with each string that `keys` maps replaced, however deep. */
export function replaceKeys<V>(value: V, keys: Map<string, string>): V {
	if (typeof value === 'string') return (keys.get(value) ?? value) as V

	if (Array.isArray(value)) return value.map((item) => replaceKeys(item, keys)) as V

	if (typeof value === 'object' && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([name, item]) => [name, replaceKeys(item, keys)]),
		) as V
	}

	return value
}

/**
 * Reads the user's places and trips, gives their records to `change`, and
 * writes the documents it gives back, in one transaction.
 *
 * A draft holds each photo by a key the documents already hold, or by the key
 * of an upload. The write keeps each new upload under its saved key, with its
 * view, and stores that, so the result answers with saved keys. A draft
 * opened before the view migration can hold a photo's flat key, which stands
 * for the saved key that the documents hold now. A key that is none of these
 * is a photo gone since the draft was opened, and the write is refused. Once
 * it commits, deletes the photos no place or trip holds anymore.
 */
export async function changeTravel<T>(
	userId: string,
	change: (places: unknown[], trips: unknown[]) => TravelChange<T> | Promise<TravelChange<T>>,
): Promise<T> {
	let unused: string[] = []

	const result = await changeDocuments(
		userId,
		['places', 'trips'],
		async ([placesDoc, tripsDoc]) => {
			const places = records(placesDoc)

			const trips = records(tripsDoc)

			const changed = await change(places, trips)

			const held = photoKeys(places, trips)

			const drafted = photoKeys(changed.places ?? places, changed.trips ?? trips)

			const saved = new Map(
				[...drafted].map((key) => {
					const kept = savedKey(key)

					return [key, isUpload(key) || held.has(kept) ? kept : key]
				}),
			)

			const uploads = [...saved].filter(([key, kept]) => key !== kept && !held.has(kept))

			const gone = [...saved].some(([key, kept]) => key === kept && !held.has(key))

			let available = !gone

			// One at a time, so the resizes of a save with many photos don't fill the memory.
			for (const [key] of uploads) if (available) available = await keepPhoto(key)

			if (!available) {
				throw new DataError(
					'photo-missing',
					'A photo is no longer available. Remove it and save again.',
				)
			}

			const kept = new Set(saved.values())

			unused = [...held].filter((key) => !kept.has(key))

			return {
				result: replaceKeys(changed.result, saved),
				values: [replaceKeys(changed.places, saved), replaceKeys(changed.trips, saved)],
			}
		},
	)

	if (unused.length > 0) {
		// The write stands either way. A photo left behind is only storage.
		await deletePhotos(unused).catch((err: unknown) => {
			logger().error({ err, userId, keys: unused }, 'photo delete failed')
		})
	}

	return result
}

/** Refuses a photo key outside the user's own prefix. */
export function checkOwnPhotos(userId: string, photos: string[]): void {
	if (photos.some((photo) => !isOwnPhoto(userId, photo))) {
		throw new DataError('photo-not-yours', 'A photo is not one you uploaded')
	}
}

/** Whether a day falls within a trip's days. */
export function onTrip(day: string, trip: { startsOn: string; endsOn: string }): boolean {
	return day >= trip.startsOn && day <= trip.endsOn
}

/** Refuses a visit whose trip isn't one of the user's, or whose day falls outside that trip. */
export function checkVisitsOnTrips(
	visits: { visitedAt: string; tripId?: string }[],
	trips: unknown[],
): void {
	for (const visit of visits) {
		if (visit.tripId === undefined) continue

		const trip = trips.map(readTrip).find((stored) => stored?.id === visit.tripId)

		if (trip === undefined || !onTrip(visit.visitedAt, trip)) {
			throw new DataError('visit-outside-trip', 'A visit falls outside the days of its trip')
		}
	}
}

/**
 * Each stored photo with URLs that read it: `url` its view, and `originalUrl`
 * the photo as it was uploaded. A photo with no view, saved before views or
 * kept as a web address, answers its original in both.
 */
function presentPhotos(photos: string[]): Promise<Photo[]> {
	return Promise.all(
		photos.map(async (photo) => {
			if (isWebAddress(photo)) return { key: photo, url: photo, originalUrl: photo }

			const view = viewKey(photo)

			const originalUrl = await photoUrl(photo)

			return { key: photo, url: view ? await photoUrl(view) : originalUrl, originalUrl }
		}),
	)
}

/** A stored place as the API answers with it. */
export async function presentPlace(place: StoredPlace): Promise<Place> {
	return {
		...place,
		visits: await Promise.all(
			place.visits.map(async (visit) => ({ ...visit, photos: await presentPhotos(visit.photos) })),
		),
	}
}

/** A stored trip as the API answers with it. */
export async function presentTrip(trip: StoredTrip): Promise<Trip> {
	return { ...trip, photos: await presentPhotos(trip.photos) }
}
