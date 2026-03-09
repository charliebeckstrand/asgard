import { loadEnv } from '../lib/env.js'

export async function registerHuginnSubscription(): Promise<void> {
	const env = loadEnv()

	if (!env.HUGINN_URL || !env.HUGINN_API_KEY) {
		console.log('[saga] Huginn integration disabled (HUGINN_URL or HUGINN_API_KEY not set)')
		return
	}

	try {
		const response = await fetch(`${env.HUGINN_URL}/events/subscriptions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-API-Key': env.HUGINN_API_KEY,
			},
			body: JSON.stringify({
				topic: 'log.*',
				callback_url: `http://localhost:${env.PORT}/logs/ingest`,
				service: 'saga',
			}),
			signal: AbortSignal.timeout(5000),
		})

		if (response.ok) {
			console.log('[saga] Registered Huginn subscription for log.* events')
		} else {
			console.warn(`[saga] Failed to register Huginn subscription: HTTP ${response.status}`)
		}
	} catch (err) {
		console.warn(
			'[saga] Could not connect to Huginn (service may not be running):',
			(err as Error).message,
		)
	}
}
