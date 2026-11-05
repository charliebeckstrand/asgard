import { stubServiceEnv } from 'vali/env'

stubServiceEnv({
	MIMIR_API_KEY: 'test-mimir-api-key-that-is-at-least-32-chars',
	SPACES_KEY: 'key',
	SPACES_SECRET: 'secret',
	SPACES_REGION: 'nyc3',
	SPACES_BUCKET: 'ivory-photos',
	// The bucket's own endpoint, as the dashboard shows it.
	SPACES_ENDPOINT: 'https://ivory-photos.nyc3.digitaloceanspaces.com',
})

import {
	CopyObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3'
import sharp from 'sharp'
import {
	deletePhotos,
	isOwnPhoto,
	keepPhoto,
	photoUrl,
	savedKey,
	uploadUrl,
	viewKey,
} from '../../lib/storage.js'

const KEY = 'users/00000000-0000-4000-8000-000000000001/a.jpg'

const BUCKET_URL = 'https://ivory-photos.nyc3.digitaloceanspaces.com'

afterEach(() => {
	vi.useRealTimers()

	vi.restoreAllMocks()
})

/** Stubs the bucket: GET answers `object`, or 404 without one, and every other command succeeds. */
function stubBucket(object?: { body: Uint8Array; contentType: string }) {
	return vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
		if (!(command instanceof GetObjectCommand)) return {}

		if (!object) throw Object.assign(new Error('NoSuchKey'), { $metadata: { httpStatusCode: 404 } })

		return {
			Body: { transformToByteArray: async () => object.body },
			ContentType: object.contentType,
		}
	})
}

/** The input of each command of a type that the bucket was sent. */
function sent<T>(send: ReturnType<typeof stubBucket>, type: new (...args: never[]) => T) {
	return send.mock.calls.flatMap(([command]) =>
		command instanceof type ? [(command as { input: unknown }).input] : [],
	)
}

describe('storage', () => {
	it('signs an upload for five minutes, bound to its type and size', async () => {
		const url = new URL(await uploadUrl(KEY, 'image/jpeg', 1234))

		expect(`${url.origin}${url.pathname}`).toBe(`${BUCKET_URL}/${KEY}`)

		expect(url.searchParams.get('X-Amz-Expires')).toBe('300')

		expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host')
	})

	it('signs a read for an hour, the same URL within a quarter hour', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-10T12:16:00Z'), toFake: ['Date'] })

		const first = await photoUrl(KEY)

		vi.setSystemTime(new Date('2026-10-10T12:29:59Z'))

		expect(await photoUrl(KEY)).toBe(first)

		const url = new URL(first)

		expect(url.searchParams.get('X-Amz-Date')).toBe('20261010T121500Z')

		expect(url.searchParams.get('X-Amz-Expires')).toBe('3600')

		vi.setSystemTime(new Date('2026-10-10T12:30:00Z'))

		expect(await photoUrl(KEY)).not.toBe(first)
	})

	it('keeps an upload, and a photo saved before views, in a folder of the same name', () => {
		expect(savedKey('uploads/u1/a.jpg')).toBe('users/u1/a/original.jpg')

		expect(savedKey('users/u1/a.jpg')).toBe('users/u1/a/original.jpg')

		expect(savedKey('users/u1/a/original.jpg')).toBe('users/u1/a/original.jpg')
	})

	it('puts the view beside a saved photo, and none beside any other key', () => {
		expect(viewKey('users/u1/a/original.jpg')).toBe('users/u1/a/view.webp')

		expect(viewKey('users/u1/a.jpg')).toBeUndefined()

		expect(viewKey('uploads/u1/a.jpg')).toBeUndefined()
	})

	it('keeps a photo with a view at most 2048 px on its long side, turned upright', async () => {
		// 3000 by 1000 px, stored on its side: EXIF orientation 6 turns it upright.
		const body = await sharp({
			create: { width: 3000, height: 1000, channels: 3, background: '#808080' },
		})
			.jpeg()
			.withMetadata({ orientation: 6 })
			.toBuffer()

		const send = stubBucket({ body, contentType: 'image/jpeg' })

		expect(await keepPhoto('uploads/u1/a.jpg')).toBe(true)

		const [put] = sent(send, PutObjectCommand) as {
			Key: string
			Body: Buffer
			ContentType: string
		}[]

		expect(put?.Key).toBe('users/u1/a/view.webp')

		expect(put?.ContentType).toBe('image/webp')

		expect(await sharp(put?.Body).metadata()).toMatchObject({
			format: 'webp',
			width: 683,
			height: 2048,
		})

		expect(sent(send, CopyObjectCommand)).toEqual([
			{
				Bucket: 'ivory-photos',
				CopySource: 'ivory-photos/uploads/u1/a.jpg',
				Key: 'users/u1/a/original.jpg',
			},
		])
	})

	it('keeps a photo it cannot read as its own view', async () => {
		const body = new TextEncoder().encode('not an image')

		const send = stubBucket({ body, contentType: 'image/png' })

		expect(await keepPhoto('uploads/u1/a.png')).toBe(true)

		expect(sent(send, PutObjectCommand)).toEqual([
			{ Bucket: 'ivory-photos', Key: 'users/u1/a/view.webp', Body: body, ContentType: 'image/png' },
		])
	})

	it('keeps nothing of a photo that is not there', async () => {
		const send = stubBucket()

		expect(await keepPhoto('uploads/u1/a.jpg')).toBe(false)

		expect(sent(send, PutObjectCommand)).toEqual([])

		expect(sent(send, CopyObjectCommand)).toEqual([])
	})

	it('deletes each saved photo with its view', async () => {
		const send = stubBucket()

		await deletePhotos(['users/u1/a/original.jpg', 'users/u1/b.jpg'])

		expect(sent(send, DeleteObjectCommand).map((input) => (input as { Key: string }).Key)).toEqual([
			'users/u1/a/original.jpg',
			'users/u1/a/view.webp',
			'users/u1/b.jpg',
		])
	})

	it("counts a user's uploads and saved photos as their own, and no one else's", () => {
		expect(isOwnPhoto('u1', 'uploads/u1/a.jpg')).toBe(true)

		expect(isOwnPhoto('u1', 'users/u1/a.jpg')).toBe(true)

		expect(isOwnPhoto('u1', 'uploads/u2/a.jpg')).toBe(false)
	})
})
