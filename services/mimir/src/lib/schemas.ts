import { z } from '@hono/zod-openapi'

const MAX_TEXT = 2_000

const MAX_RATING = 5

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
		.optional()

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

export const PlaceDraftSchema = z
	.object({
		name: text('name'),
		category: PlaceCategorySchema,
		address: text('address'),
		city: optionalText('city'),
		state: optionalText('state'),
		country: optionalText('country'),
		latitude: coordinate('latitude', 90),
		longitude: coordinate('longitude', 180),
		rating: z
			.number()
			.int(`\`rating\` must be a whole number from 0 to ${MAX_RATING}.`)
			.min(0, `\`rating\` must be a whole number from 0 to ${MAX_RATING}.`)
			.max(MAX_RATING, `\`rating\` must be a whole number from 0 to ${MAX_RATING}.`)
			.openapi({ description: `1 to ${MAX_RATING}, or 0 for none` }),
		review: optionalText('review'),
		url: webAddress('url'),
		photo: webAddress('photo'),
		visitedAt: z
			.string('`visitedAt` must be a YYYY-MM-DD day.')
			.regex(/^\d{4}-\d{2}-\d{2}$/, '`visitedAt` must be a YYYY-MM-DD day.')
			.refine(isDay, '`visitedAt` must be a YYYY-MM-DD day.')
			.openapi({ description: 'The day of the visit', example: '2026-09-27' }),
	})
	.openapi('PlaceDraft')

export type PlaceDraft = z.infer<typeof PlaceDraftSchema>

export const PlaceSchema = PlaceDraftSchema.extend({
	id: z.string().min(1),
	createdAt: z
		.string()
		.refine((value) => !Number.isNaN(Date.parse(value)))
		.openapi({ description: 'When the place was added, ISO 8601' }),
}).openapi('Place')

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
