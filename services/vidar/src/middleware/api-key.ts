import { bearerAuth } from 'hono/bearer-auth'
import { environment } from '../lib/env.js'

export const apiKeyAuth = () => bearerAuth({ token: environment().VIDAR_API_KEY })
