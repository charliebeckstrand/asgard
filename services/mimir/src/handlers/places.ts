import { randomUUID } from 'node:crypto'
import { type Place, type PlaceDraft, PlaceSchema, type Visit } from '../lib/schemas.js'
import { changeDocument, readDocument } from './documents.js'

/** The most places one user keeps, so no account can fill the database. */
export const MAX_PLACES = 1000

/** The stored records of a document, or none where it doesn't exist yet. */
function records(document: unknown): unknown[] {
	return Array.isArray(document) ? document : []
}

/** The day of the newest visit to a place. Its visits are stored newest first. */
function lastVisit(place: Place): string {
	return place.visits[0]?.visitedAt ?? ''
}

/** Whether a stored record carries this id, whether or not the rest of it reads as a place. */
function hasId(record: unknown, id: string): boolean {
	return typeof record === 'object' && record !== null && (record as { id?: unknown }).id === id
}

/**
 * A stored record in the shape the schema reads.
 *
 * A place stored before visits kept one visit in its own fields: `visitedAt`,
 * `rating`, `review` and `photo`. Such a record reads as a place with that one
 * visit, under the id of the place. The next write of the place stores the new
 * shape.
 */
function upgradeRecord(record: unknown): unknown {
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
function readPlace(record: unknown): Place | undefined {
	const parsed = PlaceSchema.safeParse(upgradeRecord(record))

	return parsed.success ? parsed.data : undefined
}

/**
 * The visits of a draft as Mimir stores them: each with an id, newest first.
 * A visit without an id is new, and gets one.
 */
function storedVisits(draft: PlaceDraft): Visit[] {
	return draft.visits
		.map((visit) => ({ ...visit, id: visit.id ?? randomUUID() }))
		.sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))
}

/**
 * Every stored place, newest visit first, leaving out any record that no longer
 * reads as one.
 *
 * The writes below don't start from this list. They change the matched record
 * and keep the others as they are, so a record a stricter schema can't read
 * stays in the document instead of disappearing on the next write.
 */
export async function listPlaces(userId: string): Promise<Place[]> {
	const places: Place[] = []

	for (const record of records(await readDocument(userId, 'places'))) {
		const place = readPlace(record)

		if (place !== undefined) places.push(place)
	}

	return places.sort((a, b) => lastVisit(b).localeCompare(lastVisit(a)))
}

/** Adds one place. `null` where the user already keeps {@link MAX_PLACES}. */
export function addPlace(userId: string, draft: PlaceDraft): Promise<Place | null> {
	return changeDocument(userId, 'places', (document) => {
		const stored = records(document)

		if (stored.length >= MAX_PLACES) return { result: null }

		const place: Place = {
			...draft,
			id: randomUUID(),
			createdAt: new Date().toISOString(),
			visits: storedVisits(draft),
		}

		return { result: place, value: [place, ...stored] }
	})
}

/**
 * Replaces one place, keeping its id and when it was added. `null` where no
 * place carries that id, rather than writing one under an id the caller made up.
 */
export function updatePlace(userId: string, id: string, draft: PlaceDraft): Promise<Place | null> {
	return changeDocument(userId, 'places', (document) => {
		const stored = records(document)

		const held = stored.map(readPlace).find((place) => place?.id === id)

		if (held === undefined) return { result: null }

		const updated: Place = { ...draft, id, createdAt: held.createdAt, visits: storedVisits(draft) }

		return {
			result: updated,
			value: stored.map((record) => (hasId(record, id) ? updated : record)),
		}
	})
}

/** Removes one place. `false` where none carried that id. */
export function removePlace(userId: string, id: string): Promise<boolean> {
	return changeDocument(userId, 'places', (document) => {
		const stored = records(document)

		const kept = stored.filter((record) => !hasId(record, id))

		if (kept.length === stored.length) return { result: false }

		return { result: true, value: kept }
	})
}
