import { z } from '@hono/zod-openapi'

const MAX_TEXT = 2_000

const MAX_RATING = 5

/** Weeks in a regular season, with room for one more. */
const MAX_WEEK = 19

/** Games in an NFL week, with room for a larger league. */
const MAX_GAMES = 32

/** The largest point spread a pick can carry, well past any NFL line. */
const MAX_LINE = 50

/** Photos on one visit, so a visit can't fill the document. */
const MAX_PHOTOS = 12

/** Visits to one place, so a place can't fill the document. */
export const MAX_VISITS = 200

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

// It becomes a link in the page, so only http(s) passes.
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

/** Photos on one trip. */
const MAX_TRIP_PHOTOS = 50

/** Stops a new trip can carry. */
const MAX_STOPS = 100

/** The largest photo a user can upload, in bytes. */
const MAX_PHOTO_BYTES = 15 * 1024 * 1024

/** The image types a user can upload, and the extension of each one's key. */
export const PHOTO_TYPES = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
} as const

export type PhotoType = keyof typeof PHOTO_TYPES

const day = (field: string) =>
	z
		.string(`\`${field}\` must be a YYYY-MM-DD day.`)
		.regex(/^\d{4}-\d{2}-\d{2}$/, `\`${field}\` must be a YYYY-MM-DD day.`)
		.refine(isDay, `\`${field}\` must be a YYYY-MM-DD day.`)

/** An id Mimir gave, of a place, visit or trip. */
const id = (field: string) =>
	z.string(`\`${field}\` is required.`).min(1, `\`${field}\` is required.`).max(64)

const createdAt = z
	.string()
	.refine((value) => !Number.isNaN(Date.parse(value)))
	.openapi({ description: 'When it was added, ISO 8601' })

/**
 * The key of an uploaded photo: `users/{userId}/{uuid}.{ext}`. A document keeps
 * keys, never URLs, so a stored photo can't point anywhere else.
 */
const PhotoKeySchema = z
	.string('A photo must be the key of an uploaded photo.')
	.regex(
		/^users\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z]{3,4}$/,
		'A photo must be the key of an uploaded photo.',
	)
	.openapi({ description: 'The key `POST /api/photos/uploads` gave' })

const PhotoSchema = z
	.object({
		key: z.string(),
		url: z.string().openapi({ description: 'Reads the photo for at least 45 minutes' }),
	})
	.openapi('Photo')

/**
 * A stored photo: a key, or, until the photo migration has copied it, the web
 * address of a photo saved before keys.
 */
const storedPhotos = z.array(z.string())

const LocationSchema = z
	.object({
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
	})
	.openapi('Location')

const PlaceCategorySchema = z
	.enum(['food', 'entertainment', 'nature', 'shopping', 'other'], {
		error: '`category` is not one of the known categories.',
	})
	.openapi('PlaceCategory')

/** The fields of a visit beside its id and photos, the same in a draft and in a stored visit. */
const visitFields = {
	visitedAt: day('visitedAt').openapi({
		description: 'The day of the visit',
		example: '2026-09-27',
	}),
	rating: z
		.number()
		.multipleOf(0.5, `\`rating\` must be a half step from 0 to ${MAX_RATING}.`)
		.min(0, `\`rating\` must be a half step from 0 to ${MAX_RATING}.`)
		.max(MAX_RATING, `\`rating\` must be a half step from 0 to ${MAX_RATING}.`)
		.openapi({ description: `0.5 to ${MAX_RATING} in half steps, or 0 for none` }),
	review: optionalText('review'),
	tripId: id('tripId').optional().openapi({
		description: "The user's trip the visit was part of. `visitedAt` must fall in its days.",
	}),
}

const VisitDraftSchema = z
	.object({
		id: id('id').optional().openapi({
			description: 'The id of a stored visit, kept on a write. Mimir gives a new visit its id.',
		}),
		...visitFields,
		photos: z
			.array(PhotoKeySchema)
			.max(MAX_PHOTOS, `A visit holds at most ${MAX_PHOTOS} photos.`)
			.openapi({ description: 'Pictures of the visit, in the order the user put them' }),
	})
	.openapi('VisitDraft')

const VisitSchema = z
	.object({ id: z.string(), ...visitFields, photos: z.array(PhotoSchema) })
	.openapi('Visit')

const StoredVisitSchema = z.object({ id: z.string().min(1), ...visitFields, photos: storedPhotos })

export type StoredVisit = z.infer<typeof StoredVisitSchema>

/** The fields a place carries beside its location and visits, the same in a draft and in a stored place. */
const placeFields = {
	name: text('name').openapi({ description: 'The business or place name' }),
	category: PlaceCategorySchema,
	url: webAddress('url').optional(),
}

export const PlaceDraftSchema = LocationSchema.extend({
	...placeFields,
	visits: z
		.array(VisitDraftSchema)
		.min(1, 'A place needs at least one visit.')
		.max(MAX_VISITS, `A place holds at most ${MAX_VISITS} visits.`)
		.refine((visits) => {
			const ids = visits.flatMap((visit) => (visit.id === undefined ? [] : [visit.id]))

			return new Set(ids).size === ids.length
		}, 'Each visit needs its own id.'),
}).openapi('PlaceDraft')

export type PlaceDraft = z.infer<typeof PlaceDraftSchema>

export const PlaceSchema = LocationSchema.extend({
	id: z.string(),
	createdAt,
	...placeFields,
	visits: z.array(VisitSchema).openapi({ description: 'Newest visit first' }),
}).openapi('Place')

export type Place = z.infer<typeof PlaceSchema>

/** A place as the document keeps it. A record that doesn't parse stays in the document unread. */
export const StoredPlaceSchema = LocationSchema.extend({
	id: z.string().min(1),
	createdAt,
	...placeFields,
	visits: z.array(StoredVisitSchema).min(1),
})

export type StoredPlace = z.infer<typeof StoredPlaceSchema>

export const PlaceListSchema = z.array(PlaceSchema).openapi('PlaceList')

const tripFields = {
	name: text('name').openapi({ description: 'What the user calls the trip' }),
	startsOn: day('startsOn').openapi({
		description: 'The first day of the trip',
		example: '2026-09-25',
	}),
	endsOn: day('endsOn').openapi({
		description: 'The last day of the trip, on or after `startsOn`',
		example: '2026-09-28',
	}),
}

const daysInOrder = (trip: { startsOn: string; endsOn: string }) => trip.endsOn >= trip.startsOn

const DAYS_IN_ORDER = { message: '`endsOn` must be on or after `startsOn`.', path: ['endsOn'] }

export const TripDraftSchema = LocationSchema.extend({
	...tripFields,
	photos: z
		.array(PhotoKeySchema)
		.max(MAX_TRIP_PHOTOS, `A trip holds at most ${MAX_TRIP_PHOTOS} photos.`)
		.openapi({ description: 'Pictures of the trip, in the order the user put them' }),
})
	.refine(daysInOrder, DAYS_IN_ORDER)
	.openapi('TripDraft')

export type TripDraft = z.infer<typeof TripDraftSchema>

export const TripSchema = LocationSchema.extend({
	id: z.string(),
	createdAt,
	...tripFields,
	photos: z.array(PhotoSchema),
}).openapi('Trip')

export type Trip = z.infer<typeof TripSchema>

export const StoredTripSchema = LocationSchema.extend({
	id: z.string().min(1),
	createdAt,
	...tripFields,
	photos: storedPhotos,
})

export type StoredTrip = z.infer<typeof StoredTripSchema>

export const TripListSchema = z
	.array(TripSchema)
	.openapi('TripList', { description: 'Newest `startsOn` first' })

const TripStopSchema = z
	.union([
		z.object({
			placeId: id('placeId').openapi({ description: 'A stored place the visit is added to' }),
			visit: VisitDraftSchema,
		}),
		z.object({
			place: PlaceDraftSchema.refine(
				(place) => place.visits.length === 1,
				'A new place on a trip has one visit.',
			),
		}),
	])
	.openapi('TripStop', {
		description:
			'A visit to a stored place, or a new place with its one visit. Mimir sets the visit’s `tripId`. A visit with the `id` of one of the place’s visits replaces it.',
	})

export type TripStop = z.infer<typeof TripStopSchema>

export const NewTripSchema = TripDraftSchema.extend({
	stops: z
		.array(TripStopSchema)
		.max(MAX_STOPS, `A new trip holds at most ${MAX_STOPS} stops.`)
		.optional(),
}).openapi('NewTrip')

export type NewTrip = z.infer<typeof NewTripSchema>

export const CreatedTripSchema = z
	.object({
		trip: TripSchema,
		places: PlaceListSchema.openapi({ description: 'The places the stops added or changed' }),
	})
	.openapi('CreatedTrip')

export const PhotoUploadRequestSchema = z
	.object({
		contentType: z.enum(Object.keys(PHOTO_TYPES) as [PhotoType, ...PhotoType[]], {
			error: '`contentType` must be image/jpeg, image/png or image/webp.',
		}),
		size: z
			.number('`size` must be a number of bytes.')
			.int('`size` must be a number of bytes.')
			.min(1, '`size` must be a number of bytes.')
			.max(MAX_PHOTO_BYTES, 'A photo can be at most 15 MB.')
			.openapi({ description: 'The size of the photo in bytes, at most 15 MB' }),
	})
	.openapi('PhotoUploadRequest')

export const PhotoUploadSchema = z
	.object({
		key: z
			.string()
			.openapi({ description: 'What a draft sends for the photo once it is uploaded' }),
		uploadUrl: z.string().openapi({
			description:
				'PUT the photo here within five minutes, with the same `content-type` and exactly `size` bytes',
		}),
	})
	.openapi('PhotoUpload')

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

/**
 * One pick: the picked team, and the point spread of that team when the pick
 * was saved. The line is `null` when the sportsbooks had no line yet, and the
 * picks app then scores the pick on the closing line.
 */
const PickSchema = z.object({
	team: FeedIdSchema,
	line: z
		.number('`line` must be a number or null.')
		.min(-MAX_LINE, `\`line\` must be within ${MAX_LINE} points.`)
		.max(MAX_LINE, `\`line\` must be within ${MAX_LINE} points.`)
		.nullable(),
})

export const WeekPicksSchema = z
	.record(FeedIdSchema, PickSchema)
	.refine(
		(picks) => Object.keys(picks).length <= MAX_GAMES,
		`A week holds at most ${MAX_GAMES} picks.`,
	)
	.openapi('WeekPicks', {
		description: 'The pick of each game id: the picked team and its line when it was saved',
	})

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
		trips: TripListSchema,
		predictions: z.record(z.string(), SeasonPicksSchema).openapi({
			description: 'The NFL picks, by season',
		}),
	})
	.openapi('AccountData')
