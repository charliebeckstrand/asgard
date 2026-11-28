import type { ClientConfig } from 'pg'

export interface ConnectionOptions {
	/** A `postgres://` URL. `sslmode` other than `disable` turns TLS on. */
	url: string
	/**
	 * PEM certificate of the server's CA. With it, TLS verifies the server;
	 * without it, TLS encrypts but trusts any certificate, like libpq's `require`.
	 */
	ca?: string
}

/**
 * Connection settings for node-postgres. The URL goes to node-postgres without
 * its `sslmode`, which would otherwise override the TLS settings here.
 */
export function connectionConfig({ url, ca }: ConnectionOptions): ClientConfig {
	const parsed = new URL(url)

	const sslmode = parsed.searchParams.get('sslmode')

	parsed.searchParams.delete('sslmode')

	const tls = sslmode !== null && sslmode !== 'disable'

	return {
		connectionString: parsed.href,
		ssl: tls ? (ca ? { ca } : { rejectUnauthorized: false }) : false,
	}
}
