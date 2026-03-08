export async function loadConfig(namespace: string): Promise<void> {
	const friggUrl = process.env.FRIGG_URL
	const friggApiKey = process.env.FRIGG_API_KEY

	if (!friggUrl) return

	try {
		const res = await fetch(`${friggUrl}/frigg/environment/${namespace}`, {
			headers: friggApiKey ? { 'X-API-Key': friggApiKey } : {},
			signal: AbortSignal.timeout(5000),
		})

		if (!res.ok) return

		const { data } = (await res.json()) as { data: Record<string, string> }

		for (const [key, value] of Object.entries(data)) {
			if (!process.env[key]) {
				process.env[key] = value
			}
		}
	} catch {
		// Frigg unreachable — fall back to existing env
	}
}
