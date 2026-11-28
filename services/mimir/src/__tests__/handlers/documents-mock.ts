// The documents as a map, for tests of what the handlers do with a document.
// documents.integration.test.ts covers the database. Use it with
// `vi.mock('../../handlers/documents.js', () => import('./documents-mock.js'))`.

type Change<T> = { result: T; values: unknown[] }

export const documents = new Map<string, unknown>()

/** What a change gets as its transaction, for a test of a write that it gives the transaction to. */
export const transaction = { name: 'transaction' }

let changing = 0

/** Whether a change is running, as a lock and a connection would be held for it. */
export function isChanging(): boolean {
	return changing > 0
}

export async function readDocument(userId: string, name: string): Promise<unknown> {
	return documents.get(`${userId}:${name}`)
}

export async function changeDocuments<T>(
	userId: string,
	names: string[],
	change: (documents: unknown[], tx: typeof transaction) => Change<T> | Promise<Change<T>>,
): Promise<T> {
	changing++

	const { result, values } = await Promise.resolve(
		change(
			names.map((name) => documents.get(`${userId}:${name}`)),
			transaction,
		),
	).finally(() => {
		changing--
	})

	for (const [index, name] of names.entries()) {
		if (values[index] !== undefined) documents.set(`${userId}:${name}`, values[index])
	}

	return result
}

export function changeDocument<T>(
	userId: string,
	name: string,
	change: (document: unknown, tx: typeof transaction) => Promise<{ result: T; value?: unknown }>,
): Promise<T> {
	return changeDocuments(userId, [name], async ([document], tx) => {
		const { result, value } = await change(document, tx)

		return { result, values: [value] }
	})
}

export async function documentOwners(name: string): Promise<string[]> {
	return [...documents.keys()]
		.filter((key) => key.endsWith(`:${name}`))
		.map((key) => key.slice(0, -name.length - 1))
}
