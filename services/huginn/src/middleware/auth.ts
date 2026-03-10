import { createApiKeyAuth } from 'grid'
import { loadEnv } from '../lib/env.js'

export const apiKeyAuth = () => createApiKeyAuth(() => loadEnv().HUGINN_API_KEY)
