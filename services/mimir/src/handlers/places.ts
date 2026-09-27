import { randomUUID } from 'node:crypto'
import { type Place, type PlaceDraft, PlaceSchema } from '../lib/schemas.js'
import { changeDocument, readDocument } from './documents.js'

/** The most places one user keeps, so no account can fill the database. */
export const MAX_PLACES = 1000

/** The stored records of a document, or none where it doesn't exist yet. */
function records(document: unknown): unknown[] {
	return Array.isArray(document) ? document : []
}

/** Whether a stored record carries this id, whether or not the rest of it reads as a place. */
function hasId(record: unknown, id: string): boolean {
	return typeof record === 'object' && record !== null && (record as { id?: unknown }).id === id
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
		const parsed = PlaceSchema.safeParse(record)

		if (parsed.success) places.push(parsed.data)
	}

	return places.sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))
}

/** Adds one place. `null` where the user already keeps {@link MAX_PLACES}. */
export function addPlace(userId: string, draft: PlaceDraft): Promise<Place | null> {
	return changeDocument(userId, 'places', (document) => {
		const stored = records(document)

		if (stored.length >= MAX_PLACES) return { result: null }

		const place: Place = { ...draft, id: randomUUID(), createdAt: new Date().toISOString() }

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

		const held = stored
			.map((record) => PlaceSchema.safeParse(record))
			.find((parsed) => parsed.success && parsed.data.id === id)

		if (!held?.success) return { result: null }

		const updated: Place = { ...draft, id, createdAt: held.data.createdAt }

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
