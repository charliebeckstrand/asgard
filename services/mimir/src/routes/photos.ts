import { createRoute } from '@hono/zod-openapi'
import { createRouter, errorResponse, jsonRequest, jsonResponse } from 'grid'
import { PHOTO_TYPES, PhotoUploadRequestSchema, PhotoUploadSchema } from '../lib/schemas.js'
import { newUploadKey, uploadUrl } from '../lib/storage.js'
import { requireRole, requireUser, type UserEnv } from '../middleware/user.js'

const createUploadRoute = createRoute({
	method: 'post',
	path: '/photos/uploads',
	tags: ['Photos'],
	summary: 'Start a photo upload',
	description:
		'Answers with a key and a URL to PUT the photo to. Once uploaded, a visit or trip draft sends the key, and the save keeps the photo under a new key it answers with. An upload no save keeps within a day is deleted.',
	middleware: [requireRole('user')] as const,
	request: {
		body: jsonRequest(PhotoUploadRequestSchema),
	},
	responses: {
		200: jsonResponse(PhotoUploadSchema, 'Upload ready'),
		400: errorResponse('Not a JPEG, PNG or WebP, or larger than 15 MB'),
		401: errorResponse('Not signed in'),
		403: errorResponse('No user role, or email not verified'),
	},
})

const photosRoutes = createRouter<UserEnv>()

photosRoutes.openapi(createUploadRoute, async (c) => {
	const { contentType, size } = c.req.valid('json')

	const key = newUploadKey(requireUser(c).id, PHOTO_TYPES[contentType])

	return c.json({ key, uploadUrl: await uploadUrl(key, contentType, size) }, 200)
})

export { photosRoutes }
