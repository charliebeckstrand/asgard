import { createRoute } from '@hono/zod-openapi'
import { createRouter, errorResponse, jsonRequest, jsonResponse } from 'grid'
import { PHOTO_TYPES, PhotoUploadRequestSchema, PhotoUploadSchema } from '../lib/schemas.js'
import { newPhotoKey, uploadUrl } from '../lib/storage.js'
import { requireRole, requireUser, type UserEnv } from '../middleware/user.js'

const createUploadRoute = createRoute({
	method: 'post',
	path: '/photos/uploads',
	tags: ['Photos'],
	summary: 'Start a photo upload',
	description:
		'Answers with a key and a URL to PUT the photo to. Once uploaded, a visit or trip draft sends the key. A photo no visit or trip holds is deleted once it is a day old.',
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

	const key = newPhotoKey(requireUser(c).id, PHOTO_TYPES[contentType])

	return c.json({ key, uploadUrl: await uploadUrl(key, contentType, size) }, 200)
})

export { photosRoutes }
