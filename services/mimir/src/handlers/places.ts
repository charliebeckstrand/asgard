import { randomUUID } from 'node:crypto'
import type { Place, PlaceDraft, StoredPlace, StoredVisit } from '../lib/schemas.js'
import { readDocument } from './documents.js'
import {
	changeTravel,
	checkOwnPhotos,
	checkVisitsOnTrips,
	hasId,
	presentPlace,
	readPlace,
	records,
} from './travel.js'

/** The most places one user keeps, so no account can fill the database. */
export const MAX_PLACES = 1000

/** The day of the newest visit to a place. Its visits are stored newest first. */
function lastVisit(place: StoredPlace): string {
	return place.visits[0]?.visitedAt ?? ''
}

/** Newest visit first, the order visits are stored in. */
export function newestFirst(visits: StoredVisit[]): StoredVisit[] {
	return visits.sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))
}

/**
 * The visits of a draft as Mimir stores them: each with an id, newest first.
 * A visit without an id is new, and gets one.
 */
function storedVisits(draft: PlaceDraft): StoredVisit[] {
	return newestFirst(draft.visits.map((visit) => ({ ...visit, id: visit.id ?? randomUUID() })))
}

/** Refuses a draft with another user's photos, or a visit outside its trip. */
function checkDraft(userId: string, draft: PlaceDraft, trips: unknown[]): void {
	checkOwnPhotos(
		userId,
		draft.visits.flatMap((visit) => visit.photos),
	)

	checkVisitsOnTrips(draft.visits, trips)
}

/**
 * Every stored place, newest visit first, leaving out any record that no longer
 * reads as one.
 *
 * The writes below don't start from this list. They change the matched record
 * and keep the others as they are, so a record a stricter schema can't read
 * stays in the document instead of disappearing on the next write.
 */
export async function storedPlaces(userId: string): Promise<StoredPlace[]> {
	const places: StoredPlace[] = []

	for (const record of records(await readDocument(userId, 'places'))) {
		const place = readPlace(record)

		if (place !== undefined) places.push(place)
	}

	return places.sort((a, b) => lastVisit(b).localeCompare(lastVisit(a)))
}

/** Every place, newest visit first, with a URL for each photo. */
export async function listPlaces(userId: string): Promise<Place[]> {
	return Promise.all((await storedPlaces(userId)).map(presentPlace))
}

/** Adds one place. `null` where the user already keeps {@link MAX_PLACES}. */
export async function addPlace(userId: string, draft: PlaceDraft): Promise<Place | null> {
	const place = await changeTravel(userId, (places, trips) => {
		checkDraft(userId, draft, trips)

		if (places.length >= MAX_PLACES) return { result: null }

		const added: StoredPlace = {
			...draft,
			id: randomUUID(),
			createdAt: new Date().toISOString(),
			visits: storedVisits(draft),
		}

		return { result: added, places: [added, ...places] }
	})

	return place && presentPlace(place)
}

/**
 * Replaces one place, keeping its id and when it was added. `null` where no
 * place carries that id, rather than writing one under an id the caller made up.
 */
export async function updatePlace(
	userId: string,
	id: string,
	draft: PlaceDraft,
): Promise<Place | null> {
	const place = await changeTravel(userId, (places, trips) => {
		checkDraft(userId, draft, trips)

		const held = places.map(readPlace).find((stored) => stored?.id === id)

		if (held === undefined) return { result: null }

		const updated: StoredPlace = {
			...draft,
			id,
			createdAt: held.createdAt,
			visits: storedVisits(draft),
		}

		return {
			result: updated,
			places: places.map((record) => (hasId(record, id) ? updated : record)),
		}
	})

	return place && presentPlace(place)
}

/** Removes one place and its photos. `false` where none carried that id. */
export function removePlace(userId: string, id: string): Promise<boolean> {
	return changeTravel(userId, (places) => {
		const kept = places.filter((record) => !hasId(record, id))

		if (kept.length === places.length) return { result: false }

		return { result: true, places: kept }
	})
}
