import { sql } from 'mimir'
import { getDb } from '../lib/db.js'

type CreateInput = {
	topic: string
	callback_url: string
	service: string
}

type Subscription = {
	id: string
	topic: string
	callback_url: string
	service: string
	is_active: boolean
	created_at: string
	updated_at: string
}

type SubscriptionList = {
	data: Subscription[]
	total: number
}

export async function listSubscriptions(topic?: string): Promise<SubscriptionList> {
	const db = getDb()

	const topicFilter = topic ? sql`AND topic = ${topic}` : sql.raw('')

	const rows = await db.many<Subscription>(
		sql`SELECT id, topic, callback_url, service, is_active,
		 created_at::text as created_at, updated_at::text as updated_at
		 FROM huginn.subscriptions WHERE is_active = TRUE ${topicFilter}
		 ORDER BY created_at DESC`,
	)

	return { data: rows, total: rows.length }
}

export async function createSubscription(input: CreateInput): Promise<Subscription> {
	const db = getDb()

	return db.first<Subscription>(
		sql`INSERT INTO huginn.subscriptions (topic, callback_url, service)
		 VALUES (${input.topic}, ${input.callback_url}, ${input.service})
		 RETURNING id, topic, callback_url, service, is_active,
		 created_at::text as created_at, updated_at::text as updated_at`,
	)
}

export async function deleteSubscription(id: string): Promise<boolean> {
	const db = getDb()

	const count = await db.exec(
		sql`UPDATE huginn.subscriptions SET is_active = FALSE, updated_at = now() WHERE id = ${id} AND is_active = TRUE`,
	)

	return count > 0
}
