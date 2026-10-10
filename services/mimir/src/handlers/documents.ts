import { type Queryable, sql } from 'saga'
import { db } from '../lib/db.js'

/**
 * Each user has one JSON document for each name, a row of `documents`.
 *
 * Each write reads the document, changes it, and writes it back through
 * {@link changeDocument}, which holds a lock on the document for that time, so
 * two requests that land together can't each read the same document and write
 * back over one another. The lock holds across instances, and across Midgard's
 * old places routes, which took the same lock while both were live.
 */

export type DocumentName = 'places' | 'trips' | 'visits' | 'predictions'

/**
 * What a change gives back: the result for the caller, and the new document.
 * Without `value`, the change writes nothing.
 */
export type Change<T> = { result: T; value?: unknown }

function select(q: Queryable, userId: string, name: DocumentName): Promise<unknown> {
	return q
		.first<{ value: unknown }>(
			sql`SELECT value FROM documents WHERE user_id = ${userId} AND name = ${name}`,
		)
		.then((row) => row?.value)
}

/** Reads one document, or `undefined` where it doesn't exist yet. */
export function readDocument(userId: string, name: DocumentName): Promise<unknown> {
	return select(db, userId, name)
}

/** The users who have a document of this name. */
export async function documentOwners(name: DocumentName): Promise<string[]> {
	const rows = await db.many<{ user_id: string }>(
		sql`SELECT user_id FROM documents WHERE name = ${name} ORDER BY user_id`,
	)

	return rows.map((row) => row.user_id)
}

/**
 * Reads one document, gives it to `change`, and writes the value `change` gives
 * back, in one transaction.
 */
export function changeDocument<T>(
	userId: string,
	name: DocumentName,
	change: (document: unknown) => Change<T> | Promise<Change<T>>,
): Promise<T> {
	return changeDocuments(userId, [name], async ([document]) => {
		const { result, value } = await change(document)

		return { result, values: [value] }
	})
}

/**
 * Like {@link changeDocument}, for a change that reads and writes several
 * documents together. `change` gets them in the order of `names`, and gives
 * back each one's new value in that order, `undefined` to leave it.
 *
 * An advisory lock holds each document rather than a row lock, because the
 * first write of a document has no row to lock. The locks are taken in name
 * order, so two changes of the same documents can't each wait on the other.
 */
export function changeDocuments<T>(
	userId: string,
	names: DocumentName[],
	change: (
		documents: unknown[],
	) => { result: T; values: unknown[] } | Promise<{ result: T; values: unknown[] }>,
): Promise<T> {
	return db.tx(async (tx) => {
		for (const name of [...names].sort()) {
			await tx.exec(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text || ':' || ${name}::text, 0))`,
			)
		}

		const documents: unknown[] = []

		for (const name of names) documents.push(await select(tx, userId, name))

		const { result, values } = await change(documents)

		for (const [index, name] of names.entries()) {
			const value = values[index]

			if (value === undefined) continue

			await tx.exec(sql`
				INSERT INTO documents (user_id, name, value)
				VALUES (${userId}, ${name}, ${sql.json(value)}::jsonb)
				ON CONFLICT (user_id, name) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
			`)
		}

		return result
	})
}

/**
 * Deletes every document of the user, for when their account is deleted. A
 * write already on its way would write its document again, so bifrost ends
 * the user's other sessions before it asks for this.
 */
export async function deleteDocuments(userId: string): Promise<void> {
	await db.exec(sql`DELETE FROM documents WHERE user_id = ${userId}`)
}
