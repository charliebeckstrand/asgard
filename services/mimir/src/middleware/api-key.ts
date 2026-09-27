import { createBearerAuth } from 'grid/middleware'
import { environment } from '../lib/env.js'

export const apiKeyAuth = () => createBearerAuth(() => environment().MIMIR_API_KEY)
