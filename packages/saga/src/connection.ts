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
 * Connection settings for node-postgres, taken apart from the URL. Passing the
 * URL whole would let its `sslmode` override the TLS settings here.
 */
export function connectionConfig({ url, ca }: ConnectionOptions): ClientConfig {
	const parsed = new URL(url)

	const sslmode = parsed.searchParams.get('sslmode')

	const tls = sslmode !== null && sslmode !== 'disable'

	return {
		host: parsed.hostname,
		port: Number.parseInt(parsed.port, 10) || 5432,
		database: parsed.pathname.slice(1),
		user: decodeURIComponent(parsed.username),
		password: decodeURIComponent(parsed.password),
		ssl: tls ? (ca ? { ca } : { rejectUnauthorized: false }) : false,
	}
}
