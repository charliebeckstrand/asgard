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

export type DocumentName = 'places' | 'visits'

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

/**
 * Reads one document, gives it to `change`, and writes the value `change` gives
 * back, in one transaction. An advisory lock holds the document rather than a
 * row lock, because the first write of a document has no row to lock.
 */
export function changeDocument<T>(
	userId: string,
	name: DocumentName,
	change: (document: unknown) => Change<T> | Promise<Change<T>>,
): Promise<T> {
	return db.tx(async (tx) => {
		await tx.exec(
			sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}::text || ':' || ${name}::text, 0))`,
		)

		const { result, value } = await change(await select(tx, userId, name))

		if (value !== undefined) {
			await tx.exec(sql`
				INSERT INTO documents (user_id, name, value)
				VALUES (${userId}, ${name}, ${sql.json(value)}::jsonb)
				ON CONFLICT (user_id, name) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
			`)
		}

		return result
	})
}
