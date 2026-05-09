import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Creates a temporary directory for test files and returns helpers.
 * Automatically cleans up after each test when used with `afterEach`.
 *
 * @example
 * ```ts
 * const tmp = await createTempDir('my-test-')
 *
 * await tmp.writeFile('migration.sql', 'CREATE TABLE t (id INT)')
 *
 * // ... run tests ...
 *
 * afterEach(async () => {
 *   await tmp.cleanup()
 * })
 * ```
 */
export async function createTempDir(prefix = 'vali-') {
	const dir = await mkdtemp(join(tmpdir(), prefix))

	return {
		/** The absolute path to the temporary directory */
		path: dir,

		/** Write a file relative to the temp directory */
		writeFile: (name: string, content: string) => writeFile(join(dir, name), content),

		/** Remove the temporary directory and all its contents */
		cleanup: () => rm(dir, { recursive: true }),
	}
}
