import { randomUUID } from 'node:crypto'
import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { HTTPException } from 'grid'
import { environment } from './env.js'
import type { PhotoType } from './schemas.js'

/**
 * Photos live in a DigitalOcean Spaces bucket, which speaks the S3 API. The
 * bucket is private: browsers upload and read through presigned URLs, and
 * documents keep each photo's object key, never a URL.
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

/** Where a user's photos live in the bucket. */
function userPrefix(userId: string): string {
	return `users/${userId}/`
}

/** A new key for a photo of the user. */
export function newPhotoKey(userId: string, extension: string): string {
	return `${userPrefix(userId)}${randomUUID()}.${extension}`
}

/** Whether a key is under the user's own prefix. */
export function isOwnPhoto(userId: string, key: string): boolean {
	return key.startsWith(userPrefix(userId))
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

/** Deletes photos. Deleting one that isn't there succeeds, as does deleting with no bucket. */
export async function deletePhotos(keys: Iterable<string>): Promise<void> {
	const configured = configuredBucket()

	if (!configured) return

	const { client, name } = configured

	await Promise.all(
		[...keys].map((key) => client.send(new DeleteObjectCommand({ Bucket: name, Key: key }))),
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

		await deletePhotos((page.Contents ?? []).flatMap((object) => object.Key ?? []))

		token = page.IsTruncated ? page.NextContinuationToken : undefined
	} while (token)
}
