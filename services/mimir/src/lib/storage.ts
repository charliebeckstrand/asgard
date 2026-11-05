import { randomUUID } from 'node:crypto'
import {
	CopyObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { HTTPException } from 'grid'
import sharp from 'sharp'
import { environment } from './env.js'
import { logger } from './log.js'
import type { PhotoType } from './schemas.js'

/**
 * Photos live in a DigitalOcean Spaces bucket, which speaks the S3 API. The
 * bucket is private: browsers upload and read through presigned URLs, and
 * documents keep each photo's object key, never a URL.
 *
 * A browser uploads under `uploads/`, where a lifecycle rule on the bucket
 * deletes whatever is left after a day. The save that keeps a photo copies it
 * to `users/{userId}/{photoId}/original.{ext}`, so an upload no save keeps
 * cleans itself up. Beside the original, the save writes `view.webp`: the
 * photo at most {@link VIEW_SIZE} px on its long side, which the apps show. A
 * browser that paints a large original again on each frame drops frames.
 *
 * Photos saved before views kept the flat key `users/{userId}/{photoId}.{ext}`,
 * with no view. The view migration moves each one to the new form.
 */

/** How long an upload URL lasts. */
const UPLOAD_SECONDS = 5 * 60

/** How long a photo URL lasts. */
const READ_SECONDS = 60 * 60

/**
 * Photo URLs are signed as of the start of the current quarter hour, so the
 * same photo keeps the same URL for that time and the browser's cache can
 * serve it. Each URL still lasts at least 45 minutes.
 */
const SIGNING_WINDOW_MS = 15 * 60 * 1000

/** The longest side of a view, in px. */
const VIEW_SIZE = 2048

/** The quality of a view, from 1 to 100. */
const VIEW_QUALITY = 80

type Bucket = { client: S3Client; name: string }

let cached: Bucket | null = null

/** The bucket, or `null` where it isn't set, as in development without Spaces. */
function configuredBucket(): Bucket | null {
	if (cached) return cached

	const { SPACES_KEY, SPACES_SECRET, SPACES_REGION, SPACES_BUCKET, SPACES_ENDPOINT } = environment()

	if (!SPACES_KEY || !SPACES_SECRET || !SPACES_REGION || !SPACES_BUCKET || !SPACES_ENDPOINT) {
		return null
	}

	// The dashboard shows the bucket's own endpoint too, with the bucket name in
	// front. The client adds the name itself, so it takes the region's endpoint.
	const endpoint = new URL(SPACES_ENDPOINT)

	endpoint.hostname = endpoint.hostname.replace(new RegExp(`^${SPACES_BUCKET}\\.`), '')

	cached = {
		client: new S3Client({
			region: SPACES_REGION,
			endpoint: endpoint.origin,
			credentials: { accessKeyId: SPACES_KEY, secretAccessKey: SPACES_SECRET },
			// Checksums only where S3 requires them. The default adds one to every
			// upload URL, which a browser's plain PUT can't satisfy.
			requestChecksumCalculation: 'WHEN_REQUIRED',
			responseChecksumValidation: 'WHEN_REQUIRED',
		}),
		name: SPACES_BUCKET,
	}

	return cached
}

/** The bucket, or a 503 where it isn't set. */
function bucket(): Bucket {
	const configured = configuredBucket()

	if (!configured) throw new HTTPException(503, { message: 'Photos are unavailable' })

	return configured
}

const SAVED = 'users/'

const UPLOADS = 'uploads/'

/** An upload's key, or a saved key from before views: `{prefix}/{userId}/{photoId}.{ext}`. */
const FLAT_KEY = /^(?:uploads|users)\/([^/]+)\/([^/]+)\.([a-z0-9]+)$/

/** A saved photo's key: `users/{userId}/{photoId}/original.{ext}`. */
const SAVED_KEY = /^(users\/[^/]+\/[^/]+\/)original\.[a-z0-9]+$/

/** Where a user's saved photos live in the bucket. */
function userPrefix(userId: string): string {
	return `${SAVED}${userId}/`
}

/**
 * A new key for a photo of the user that Mimir copied from the web. It has
 * the flat form and no view, so the view migration moves it.
 */
export function newPhotoKey(userId: string, extension: string): string {
	return `${userPrefix(userId)}${randomUUID()}.${extension}`
}

/** A new key for a photo the user uploads, which a save then keeps. */
export function newUploadKey(userId: string, extension: string): string {
	return `${UPLOADS}${userId}/${randomUUID()}.${extension}`
}

/** Whether a key is an upload's, which a save has to keep. */
export function isUpload(key: string): boolean {
	return key.startsWith(UPLOADS)
}

/**
 * The key a photo has once saved, with its view beside it. An upload's, and a
 * flat saved key from before views, is the folder of the same name under
 * `users/`. A saved key is its own.
 */
export function savedKey(key: string): string {
	const flat = FLAT_KEY.exec(key)

	return flat ? `${SAVED}${flat[1]}/${flat[2]}/original.${flat[3]}` : key
}

/** The key of a saved photo's view, or `undefined` for a key with none. */
export function viewKey(key: string): string | undefined {
	const saved = SAVED_KEY.exec(key)

	return saved ? `${saved[1]}view.webp` : undefined
}

/** Whether a key is one of the user's own, saved or uploaded. */
export function isOwnPhoto(userId: string, key: string): boolean {
	return savedKey(key).startsWith(userPrefix(userId))
}

/**
 * A URL the browser PUTs the photo to, for five minutes. It is signed with the
 * type and size, so the upload must send that `content-type` and exactly
 * `size` bytes.
 */
export function uploadUrl(key: string, contentType: PhotoType, size: number): Promise<string> {
	const { client, name } = bucket()

	return getSignedUrl(
		client,
		new PutObjectCommand({ Bucket: name, Key: key, ContentType: contentType, ContentLength: size }),
		{ expiresIn: UPLOAD_SECONDS, signableHeaders: new Set(['content-type']) },
	)
}

/** A URL that reads the photo for an hour from the start of the current quarter hour. */
export function photoUrl(key: string): Promise<string> {
	const { client, name } = bucket()

	const signingDate = new Date(Math.floor(Date.now() / SIGNING_WINDOW_MS) * SIGNING_WINDOW_MS)

	return getSignedUrl(client, new GetObjectCommand({ Bucket: name, Key: key }), {
		expiresIn: READ_SECONDS,
		signingDate,
	})
}

/** Stores a photo Mimir holds itself, such as one copied from the web. */
export async function putPhoto(key: string, body: Uint8Array, contentType: string): Promise<void> {
	const { client, name } = bucket()

	await client.send(
		new PutObjectCommand({ Bucket: name, Key: key, Body: body, ContentType: contentType }),
	)
}

/**
 * The photo at most {@link VIEW_SIZE} px on its long side, as WebP, turned as
 * its EXIF orientation says and in its own color profile. A photo the
 * resizer can't read is its own view, so each saved photo has one.
 */
async function view(body: Uint8Array, contentType: string | undefined, key: string) {
	try {
		const data = await sharp(body)
			.rotate()
			.resize({ width: VIEW_SIZE, height: VIEW_SIZE, fit: 'inside', withoutEnlargement: true })
			.keepIccProfile()
			.webp({ quality: VIEW_QUALITY })
			.toBuffer()

		return { body: data, contentType: 'image/webp' }
	} catch (err) {
		logger().warn({ err, key }, 'photo view failed, the original stands in')

		return { body, contentType }
	}
}

/**
 * Copies a photo with a flat key, an upload or one saved before views, to its
 * saved key, and writes its view beside it. `false` where the photo isn't
 * there: an upload that never finished, or that the lifecycle rule deleted.
 */
export async function keepPhoto(key: string): Promise<boolean> {
	const { client, name } = bucket()

	let original: Uint8Array

	let contentType: string | undefined

	try {
		const object = await client.send(new GetObjectCommand({ Bucket: name, Key: key }))

		original = await (object.Body as NonNullable<typeof object.Body>).transformToByteArray()

		contentType = object.ContentType
	} catch (err) {
		if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
			return false
		}

		throw err
	}

	const saved = savedKey(key)

	const resized = await view(original, contentType, key)

	await client.send(
		new PutObjectCommand({
			Bucket: name,
			Key: viewKey(saved),
			Body: resized.body,
			ContentType: resized.contentType,
		}),
	)

	await client.send(
		new CopyObjectCommand({ Bucket: name, CopySource: `${name}/${encodeURI(key)}`, Key: saved }),
	)

	return true
}

/**
 * Deletes photos, each with its view. Deleting one that isn't there succeeds,
 * as does deleting with no bucket.
 */
export function deletePhotos(keys: Iterable<string>): Promise<void> {
	return deleteObjects(
		[...keys].flatMap((key) => {
			const view = viewKey(key)

			return view ? [key, view] : [key]
		}),
	)
}

/** Deletes objects of the bucket. Deleting one that isn't there succeeds, as does deleting with no bucket. */
async function deleteObjects(keys: string[]): Promise<void> {
	const configured = configuredBucket()

	if (!configured) return

	const { client, name } = configured

	await Promise.all(
		keys.map((key) => client.send(new DeleteObjectCommand({ Bucket: name, Key: key }))),
	)
}

/** Deletes every photo under the user's prefix, saved or not, for when their account is deleted. */
export async function deleteUserPhotos(userId: string): Promise<void> {
	const configured = configuredBucket()

	// With no bucket there are no photos, so deleting an account still works.
	if (!configured) return

	const { client, name } = configured

	let token: string | undefined

	do {
		const page = await client.send(
			new ListObjectsV2Command({
				Bucket: name,
				Prefix: userPrefix(userId),
				ContinuationToken: token,
			}),
		)

		await deleteObjects((page.Contents ?? []).flatMap((object) => object.Key ?? []))

		token = page.IsTruncated ? page.NextContinuationToken : undefined
	} while (token)
}
