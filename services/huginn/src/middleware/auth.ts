import { createApiKeyAuth } from 'grid'
import { environment } from '../lib/env.js'

export const apiKeyAuth = () => createApiKeyAuth(() => environment().HUGINN_API_KEY)
