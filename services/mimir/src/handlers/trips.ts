import { randomUUID } from 'node:crypto'
import { HTTPException } from 'grid'
import { DataError } from '../lib/errors.js'
import {
	MAX_VISITS,
	type NewTrip,
	type Place,
	type StoredPlace,
	type StoredTrip,
	type Trip,
	type TripDraft,
	type TripStop,
} from '../lib/schemas.js'
import { readDocument } from './documents.js'
import { MAX_PLACES, newestFirst } from './places.js'
import {
	changeTravel,
	checkOwnPhotos,
	hasId,
	onTrip,
	presentPlace,
	presentTrip,
	readPlace,
	readTrip,
	records,
} from './travel.js'

/**
 * The trips of each user, in one document beside their places. A trip is a
 * span of days; a visit joins it by naming it in `tripId`, and must fall in
 * those days.
 */

/** The most trips one user keeps, so no account can fill the database. */
export const MAX_TRIPS = 1000

/** The visit a stop records. */
function stopVisit(stop: TripStop) {
	return 'placeId' in stop ? stop.visit : stop.place.visits[0]
}

/** Every trip, newest `startsOn` first, leaving out any record that no longer reads as one. */
export async function listTrips(userId: string): Promise<Trip[]> {
	const trips: StoredTrip[] = []

	for (const record of records(await readDocument(userId, 'trips'))) {
		const trip = readTrip(record)

		if (trip !== undefined) trips.push(trip)
	}

	trips.sort(
		(a, b) => b.startsOn.localeCompare(a.startsOn) || b.createdAt.localeCompare(a.createdAt),
	)

	return Promise.all(trips.map(presentTrip))
}

/**
 * Adds a trip, and records each stop's visit on it: a new visit to a stored
 * place, or a new place. A stop's visit with the id of one of the place's
 * visits replaces that visit, which is how an earlier visit joins the trip.
 * Answers with the trip and the places the stops added or changed.
 */
export async function createTrip(
	userId: string,
	{ stops = [], ...draft }: NewTrip,
): Promise<{ trip: Trip; places: Place[] }> {
	checkOwnPhotos(userId, [
		...draft.photos,
		...stops.flatMap((stop) => stopVisit(stop)?.photos ?? []),
	])

	const created = await changeTravel(userId, (places, trips) => {
		if (trips.length >= MAX_TRIPS) {
			throw new HTTPException(409, {
				message: `You can keep up to ${MAX_TRIPS.toLocaleString('en-US')} trips`,
			})
		}

		const now = new Date().toISOString()

		const trip: StoredTrip = { ...draft, id: randomUUID(), createdAt: now }

		const added: StoredPlace[] = []

		const changed = new Map<string, StoredPlace>()

		for (const stop of stops) {
			const visit = stopVisit(stop)

			if (visit === undefined) continue

			if (!onTrip(visit.visitedAt, trip)) {
				throw new DataError('visit-outside-trip', 'A stop falls outside the days of the trip')
			}

			const stored = { ...visit, id: visit.id ?? randomUUID(), tripId: trip.id }

			if (!('placeId' in stop)) {
				added.push({ ...stop.place, id: randomUUID(), createdAt: now, visits: [stored] })

				continue
			}

			const held =
				changed.get(stop.placeId) ??
				places.map(readPlace).find((place) => place?.id === stop.placeId)

			if (held === undefined) {
				throw new HTTPException(400, { message: 'A stop names a place you don’t keep' })
			}

			const visits = newestFirst([...held.visits.filter((kept) => kept.id !== stored.id), stored])

			if (visits.length > MAX_VISITS) {
				throw new HTTPException(409, { message: `A place holds at most ${MAX_VISITS} visits` })
			}

			changed.set(held.id, { ...held, visits })
		}

		if (places.length + added.length > MAX_PLACES) {
			throw new HTTPException(409, {
				message: `You can keep up to ${MAX_PLACES.toLocaleString('en-US')} places`,
			})
		}

		return {
			result: { trip, places: [...added, ...changed.values()] },
			places:
				stops.length === 0
					? undefined
					: [
							...added,
							...places.map((record) => {
								const place = readPlace(record)

								return (place && changed.get(place.id)) ?? record
							}),
						],
			trips: [trip, ...trips],
		}
	})

	return {
		trip: await presentTrip(created.trip),
		places: await Promise.all(created.places.map(presentPlace)),
	}
}

/**
 * Replaces a trip, keeping its id and when it was added. Refuses days that
 * would leave one of its visits outside. `null` where no trip carries that id.
 */
export async function updateTrip(
	userId: string,
	id: string,
	draft: TripDraft,
): Promise<Trip | null> {
	checkOwnPhotos(userId, draft.photos)

	const trip = await changeTravel(userId, (places, trips) => {
		const held = trips.map(readTrip).find((stored) => stored?.id === id)

		if (held === undefined) return { result: null }

		const visits = places.flatMap((record) => readPlace(record)?.visits ?? [])

		if (visits.some((visit) => visit.tripId === id && !onTrip(visit.visitedAt, draft))) {
			throw new DataError(
				'trip-days-exclude-visits',
				'The new days would leave out a visit of the trip',
			)
		}

		const updated: StoredTrip = { ...draft, id, createdAt: held.createdAt }

		return {
			result: updated,
			trips: trips.map((record) => (hasId(record, id) ? updated : record)),
		}
	})

	return trip && presentTrip(trip)
}

/**
 * Removes a trip and its photos. Its visits stay on their places, without the
 * trip. `false` where no trip carried that id.
 */
export function removeTrip(userId: string, id: string): Promise<boolean> {
	return changeTravel(userId, (places, trips) => {
		const kept = trips.filter((record) => !hasId(record, id))

		if (kept.length === trips.length) return { result: false }

		return {
			result: true,
			places: places.map((record) => {
				const place = readPlace(record)

				if (!place?.visits.some((visit) => visit.tripId === id)) return record

				return {
					...place,
					visits: place.visits.map(({ tripId, ...visit }) =>
						tripId === id ? visit : { ...visit, tripId },
					),
				}
			}),
			trips: kept,
		}
	})
}
