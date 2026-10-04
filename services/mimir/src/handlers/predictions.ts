import { type SeasonPicks, type WeekPicks, WeekPicksSchema } from '../lib/schemas.js'
import { changeDocument, readDocument } from './documents.js'

/**
 * The NFL picks of each user, in one document: the picks of each week, under
 * each season. The picks app decides which games a user can still pick, since
 * only it reads the schedule.
 */

type Predictions = Record<string, SeasonPicks>

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The stored document, or none where it doesn't exist yet. */
function predictions(document: unknown): Predictions {
	return isRecord(document) ? (document as Predictions) : {}
}

/** The weeks of one stored season that still read as picks. */
function readSeason(season: unknown): SeasonPicks {
	if (!isRecord(season)) return {}

	const weeks: SeasonPicks = {}

	for (const [week, picks] of Object.entries(season)) {
		const parsed = WeekPicksSchema.safeParse(picks)

		if (parsed.success) weeks[week] = parsed.data
	}

	return weeks
}

/** Every week the user picked in `season`, by week number. */
export async function listPicks(userId: string, season: number): Promise<SeasonPicks> {
	return readSeason(predictions(await readDocument(userId, 'predictions'))[season])
}

/** Every pick of the user, by season, for their export. */
export async function listAllPicks(userId: string): Promise<Predictions> {
	const stored = predictions(await readDocument(userId, 'predictions'))

	return Object.fromEntries(
		Object.entries(stored).map(([season, weeks]) => [season, readSeason(weeks)]),
	)
}

/** Replaces the picks of one week, and answers with them. */
export function savePicks(
	userId: string,
	season: number,
	week: number,
	picks: WeekPicks,
): Promise<WeekPicks> {
	return changeDocument(userId, 'predictions', (document) => {
		const stored = predictions(document)

		const next = { ...stored, [season]: { ...stored[season], [week]: picks } }

		return { result: picks, value: next }
	})
}

/** Deletes the picks of one week. Deleting a week with none changes nothing. */
export function deletePicks(userId: string, season: number, week: number): Promise<void> {
	return changeDocument(userId, 'predictions', (document) => {
		const stored = predictions(document)

		if (!isRecord(stored[season]) || !(week in stored[season])) return { result: undefined }

		const { [week]: _removed, ...weeks } = stored[season]

		return { result: undefined, value: { ...stored, [season]: weeks } }
	})
}
