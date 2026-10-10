import type { VisitScope, Visits } from '../lib/schemas.js'
import { changeDocument, readDocument } from './documents.js'
import { storedPlaces } from './places.js'

/**
 * The visited regions of each user, in one document beside their places. A
 * region can be visited with no place recorded in it, so this isn't derived
 * from the places.
 */

/** The most regions one user marks in each scope, so no account can fill the database. */
export const MAX_VISITS = 1000

/** The region names in an unknown list: trimmed, unique, alphabetical. */
function names(input: unknown): string[] {
	if (!Array.isArray(input)) return []

	const found = new Set<string>()

	for (const entry of input) {
		if (typeof entry !== 'string') continue

		const trimmed = entry.trim()

		if (trimmed !== '') found.add(trimmed)
	}

	return [...found].sort((a, b) => a.localeCompare(b))
}

/**
 * Reads a stored document as the two scopes. A bare list is what was stored
 * before countries existed, so it reads as states.
 */
function parseVisits(input: unknown): Visits {
	if (Array.isArray(input)) return { states: names(input), countries: [] }

	if (typeof input !== 'object' || input === null) return { states: [], countries: [] }

	const { states, countries } = input as { states?: unknown; countries?: unknown }

	return { states: names(states), countries: names(countries) }
}

/**
 * What a user with no visits document has already said: a region they recorded
 * a place in is a region they went to. Nothing is written until their first
 * change, which keeps these along with it.
 */
async function seed(userId: string): Promise<Visits> {
	const places = await storedPlaces(userId)

	return parseVisits({
		states: places.map((place) => place.state),
		countries: places.map((place) => place.country),
	})
}

async function readVisits(userId: string, document: unknown): Promise<Visits> {
	return document === undefined ? seed(userId) : parseVisits(document)
}

/** Every visited region, each scope alphabetical. */
export async function listVisits(userId: string): Promise<Visits> {
	return readVisits(userId, await readDocument(userId, 'visits'))
}

/**
 * Marks one region visited or not, and answers with both scopes. `null` where
 * marking it would pass {@link MAX_VISITS} in its scope.
 */
export function setVisit(
	userId: string,
	scope: VisitScope,
	region: string,
	visited: boolean,
): Promise<Visits | null> {
	return changeDocument(userId, 'visits', async (document) => {
		const held = await readVisits(userId, document)

		const regions = new Set(held[scope])

		if (visited && !regions.has(region) && regions.size >= MAX_VISITS) return { result: null }

		if (visited) regions.add(region)
		else regions.delete(region)

		const next: Visits = { ...held, [scope]: names([...regions]) }

		return { result: next, value: next }
	})
}
