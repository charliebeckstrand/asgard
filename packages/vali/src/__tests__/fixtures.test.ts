import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTempDir } from '../fixtures.js'

describe('createTempDir', () => {
	it('creates and cleans up a temporary directory', async () => {
		const tmp = await createTempDir('vali-test-')

		expect(tmp.path).toContain('vali-test-')

		await tmp.writeFile('test.txt', 'hello')

		const content = await readFile(join(tmp.path, 'test.txt'), 'utf-8')

		expect(content).toBe('hello')

		await tmp.cleanup()

		await expect(access(tmp.path)).rejects.toThrow()
	})
})
