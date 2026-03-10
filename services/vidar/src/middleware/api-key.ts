import { createApiKeyAuth } from 'grid'
import { loadEnv } from '../lib/env.js'

export const apiKeyAuth = () => createApiKeyAuth(() => loadEnv().VIDAR_API_KEY)
