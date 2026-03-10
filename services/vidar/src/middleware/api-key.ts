import { createBearerAuth } from 'grid'
import { environment } from '../lib/env.js'

export const apiKeyAuth = () => createBearerAuth(() => environment().VIDAR_API_KEY)
