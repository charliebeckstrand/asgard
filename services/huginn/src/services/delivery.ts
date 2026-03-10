import { sql } from 'mimir'
import { db } from '../lib/db.js'
import { emitEvent } from '../lib/emitter.js'

type PublishInput = {
	topic: string
	payload: Record<string, unknown>
	source: string
}

type Event = {
	id: string
	topic: string
	payload: Record<string, unknown>
	source: string
	created_at: string
}

type Subscription = {
	id: string
	callback_url: string
	service: string
}

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

export async function publishEvent(input: PublishInput): Promise<Event> {
	const event = await db().get<Event>(
		sql`
			INSERT INTO huginn.events (topic, payload, source)
			VALUES (${input.topic}, ${sql.json(input.payload)}, ${input.source})
			RETURNING id, topic, payload, source, created_at::text as created_at
		`,
	)

	emitEvent(event)

	deliverEvent(event).catch((err) => {
		console.error(`Failed to deliver event ${event.id}:`, err)
	})

	return event
}

async function deliverEvent(event: Event): Promise<void> {
	const subs = await db().many<Subscription>(
		sql`
			SELECT id, callback_url, service
			FROM huginn.subscriptions
			WHERE topic = ${event.topic} AND is_active = TRUE
		`,
	)

	if (subs.length === 0) return

	const deliveries = await Promise.allSettled(subs.map((sub) => deliverToSubscriber(event, sub)))

	for (let i = 0; i < deliveries.length; i++) {
		const result = deliveries[i]
		if (result.status === 'rejected') {
			console.error(
				`Delivery to ${subs[i].service} (${subs[i].callback_url}) failed:`,
				result.reason,
			)
		}
	}
}

async function deliverToSubscriber(event: Event, sub: Subscription): Promise<void> {
	const { id: deliveryId } = await db().get<{ id: string }>(
		sql`
			INSERT INTO huginn.deliveries (event_id, subscription_id, status)
			VALUES (${event.id}, ${sub.id}, 'pending')
			RETURNING id
		`,
	)

	let lastError: Error | null = null
	let responseStatus: number | null = null

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			const response = await fetch(sub.callback_url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: event.id,
					topic: event.topic,
					payload: event.payload,
					source: event.source,
					created_at: event.created_at,
				}),
				signal: AbortSignal.timeout(10000),
			})

			responseStatus = response.status

			if (response.ok) {
				await db().exec(
					sql`
						UPDATE huginn.deliveries
						SET status = 'delivered', attempts = ${attempt}, last_attempt_at = now(), response_status = ${responseStatus}
						WHERE id = ${deliveryId}
					`,
				)

				return
			}

			lastError = new Error(`HTTP ${response.status}`)
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err))
		}

		if (attempt < MAX_RETRIES) {
			const delay = BASE_DELAY_MS * 2 ** (attempt - 1)

			await new Promise((resolve) => setTimeout(resolve, delay))
		}
	}

	await db().exec(
		sql`
			UPDATE huginn.deliveries
			SET status = 'failed', attempts = ${MAX_RETRIES}, last_attempt_at = now(), response_status = ${responseStatus}, error_message = ${lastError?.message ?? 'Unknown error'}
			WHERE id = ${deliveryId}
		`,
	)
}
