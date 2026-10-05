import { z } from '@hono/zod-openapi'

const MAX_TEXT = 2_000

const MAX_RATING = 5

/** Weeks in a regular season, with room for one more. */
const MAX_WEEK = 19

/** Games in an NFL week, with room for a larger league. */
const MAX_GAMES = 32

/** Photos on one visit, so a visit can't fill the document. */
const MAX_PHOTOS = 12

/** Visits to one place, so a place can't fill the document. */
const MAX_VISITS = 200

/** Longer than any country or state name, so a region can't carry a payload. */
const MAX_REGION = 100

const text = (field: string) =>
	z
		.string(`\`${field}\` is required.`)
		.trim()
		.min(1, `\`${field}\` is required.`)
		.max(MAX_TEXT, `\`${field}\` must be at most ${MAX_TEXT} characters.`)

const optionalText = (field: string) =>
	z.string().trim().max(MAX_TEXT, `\`${field}\` must be at most ${MAX_TEXT} characters.`).optional()

// Both become a link or an image source in the page, so only http(s) passes.
const webAddress = (field: string) =>
	z
		.url({ protocol: /^https?$/, error: `\`${field}\` must be an http or https address.` })
		.max(MAX_TEXT, `\`${field}\` must be at most ${MAX_TEXT} characters.`)

const coordinate = (field: string, limit: number) =>
	z
		.number(`\`${field}\` must be a number between -${limit} and ${limit}.`)
		.min(-limit, `\`${field}\` must be a number between -${limit} and ${limit}.`)
		.max(limit, `\`${field}\` must be a number between -${limit} and ${limit}.`)

/** Whether a `YYYY-MM-DD` string names a real day: `2026-02-31` doesn't. */
function isDay(value: string): boolean {
	const date = new Date(`${value}T00:00:00Z`)

	return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

const PlaceCategorySchema = z
	.enum(['food', 'entertainment', 'nature', 'shopping', 'other'], {
		error: '`category` is not one of the known categories.',
	})
	.openapi('PlaceCategory')

export const VisitDraftSchema = z
	.object({
		id: z.string().min(1).max(64).optional().openapi({
			description: 'The id of a stored visit, kept on a write. Mimir gives a new visit its id.',
		}),
		visitedAt: z
			.string('`visitedAt` must be a YYYY-MM-DD day.')
			.regex(/^\d{4}-\d{2}-\d{2}$/, '`visitedAt` must be a YYYY-MM-DD day.')
			.refine(isDay, '`visitedAt` must be a YYYY-MM-DD day.')
			.openapi({ description: 'The day of the visit', example: '2026-09-27' }),
		rating: z
			.number()
			.int(`\`rating\` must be a whole number from 0 to ${MAX_RATING}.`)
			.min(0, `\`rating\` must be a whole number from 0 to ${MAX_RATING}.`)
			.max(MAX_RATING, `\`rating\` must be a whole number from 0 to ${MAX_RATING}.`)
			.openapi({ description: `1 to ${MAX_RATING}, or 0 for none` }),
		review: optionalText('review'),
		photos: z
			.array(webAddress('photos'))
			.max(MAX_PHOTOS, `A visit holds at most ${MAX_PHOTOS} photos.`)
			.openapi({ description: 'Pictures of the visit, in the order the user put them' }),
	})
	.openapi('VisitDraft')

export type VisitDraft = z.infer<typeof VisitDraftSchema>

export const VisitSchema = VisitDraftSchema.extend({ id: z.string().min(1) }).openapi('Visit')

export type Visit = z.infer<typeof VisitSchema>

/** The fields a place carries beside its visits, the same in a draft and in a stored place. */
const placeFields = {
	name: text('name').openapi({ description: 'The business or place name' }),
	category: PlaceCategorySchema,
	address: text('address').openapi({ description: 'The address on one line' }),
	city: optionalText('city'),
	state: optionalText('state').openapi({
		description:
			'The state the geocoder named, for places the map outline leaves out and for the state filter',
	}),
	country: optionalText('country').openapi({
		description: 'The country the geocoder named, for the country filter',
	}),
	latitude: coordinate('latitude', 90),
	longitude: coordinate('longitude', 180),
	url: webAddress('url').optional(),
}

export const PlaceDraftSchema = z
	.object({
		...placeFields,
		visits: z
			.array(VisitDraftSchema)
			.min(1, 'A place needs at least one visit.')
			.max(MAX_VISITS, `A place holds at most ${MAX_VISITS} visits.`)
			.refine((visits) => {
				const ids = visits.flatMap((visit) => (visit.id === undefined ? [] : [visit.id]))

				return new Set(ids).size === ids.length
			}, 'Each visit needs its own id.'),
	})
	.openapi('PlaceDraft')

export type PlaceDraft = z.infer<typeof PlaceDraftSchema>

export const PlaceSchema = z
	.object({
		id: z.string().min(1),
		createdAt: z
			.string()
			.refine((value) => !Number.isNaN(Date.parse(value)))
			.openapi({ description: 'When the place was added, ISO 8601' }),
		...placeFields,
		visits: z.array(VisitSchema).min(1).openapi({ description: 'Newest visit first' }),
	})
	.openapi('Place')

export type Place = z.infer<typeof PlaceSchema>

export const PlaceListSchema = z.array(PlaceSchema).openapi('PlaceList')

export const VisitScopeSchema = z
	.enum(['states', 'countries'], { error: '`scope` must be `states` or `countries`.' })
	.openapi({
		description:
			'The atlas a region is named by. Kept apart because names collide: Georgia is a state and a country.',
	})

export type VisitScope = z.infer<typeof VisitScopeSchema>

export const VisitsSchema = z
	.object({
		states: z.array(z.string()),
		countries: z.array(z.string()),
	})
	.openapi('Visits')

export type Visits = z.infer<typeof VisitsSchema>

export const RegionSchema = z
	.string()
	.trim()
	.min(1, '`region` is required.')
	.max(MAX_REGION, `\`region\` must be at most ${MAX_REGION} characters.`)

export const SetVisitSchema = z
	.object({ visited: z.boolean('`visited` must be a boolean.') })
	.openapi('SetVisit')

/** An id of the scoreboard feed, such as a game or a team. Short, so a pick can't carry a payload. */
const FeedIdSchema = z
	.string()
	.regex(/^[A-Za-z0-9_-]{1,32}$/, 'An id must be 1 to 32 letters, digits, `_` or `-`.')

export const SeasonSchema = z.coerce
	.number('`season` must be a year.')
	.int('`season` must be a year.')
	.min(2000, '`season` must be a year.')
	.max(2100, '`season` must be a year.')
	.openapi({ description: 'The year the season starts in', example: 2026 })

export const WeekSchema = z.coerce
	.number('`week` must be a week number.')
	.int('`week` must be a week number.')
	.min(1, '`week` must be a week number.')
	.max(MAX_WEEK, '`week` must be a week number.')
	.openapi({ description: 'The week of the regular season, from 1', example: 5 })

export const WeekPicksSchema = z
	.record(FeedIdSchema, FeedIdSchema)
	.refine(
		(picks) => Object.keys(picks).length <= MAX_GAMES,
		`A week holds at most ${MAX_GAMES} picks.`,
	)
	.openapi('WeekPicks', { description: 'The id of the picked team for each game id' })

export type WeekPicks = z.infer<typeof WeekPicksSchema>

export const SeasonPicksSchema = z
	.record(z.string(), WeekPicksSchema)
	.openapi('SeasonPicks', { description: 'The picks of each week with any, by week number' })

export type SeasonPicks = z.infer<typeof SeasonPicksSchema>

export const SavePicksSchema = z.object({ picks: WeekPicksSchema }).openapi('SavePicks')

export const AccountDataSchema = z
	.object({
		places: PlaceListSchema,
		visits: VisitsSchema,
		predictions: z.record(z.string(), SeasonPicksSchema).openapi({
			description: 'The NFL picks, by season',
		}),
	})
	.openapi('AccountData')
