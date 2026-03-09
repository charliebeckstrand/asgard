import { getPool } from '../lib/db.js'

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
	const pool = getPool()

	let query = `SELECT id, topic, callback_url, service, is_active,
		created_at::text as created_at, updated_at::text as updated_at
		FROM huginn.subscriptions WHERE is_active = TRUE`
	const params: string[] = []

	if (topic) {
		query += ' AND topic = $1'
		params.push(topic)
	}

	query += ' ORDER BY created_at DESC'

	const { rows } = await pool.query<Subscription>(query, params)

	return { data: rows, total: rows.length }
}

export async function createSubscription(input: CreateInput): Promise<Subscription> {
	const pool = getPool()

	const { rows } = await pool.query<Subscription>(
		`INSERT INTO huginn.subscriptions (topic, callback_url, service)
		 VALUES ($1, $2, $3)
		 RETURNING id, topic, callback_url, service, is_active,
		 created_at::text as created_at, updated_at::text as updated_at`,
		[input.topic, input.callback_url, input.service],
	)

	return rows[0]
}

export async function deleteSubscription(id: string): Promise<boolean> {
	const pool = getPool()

	const { rowCount } = await pool.query(
		`UPDATE huginn.subscriptions SET is_active = FALSE, updated_at = now() WHERE id = $1 AND is_active = TRUE`,
		[id],
	)

	return (rowCount ?? 0) > 0
}
