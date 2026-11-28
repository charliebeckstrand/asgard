import { Client } from 'pg'
import { type ConnectionOptions, connectionConfig } from '../connection.js'

/** The settings node-postgres ends up with, which is what the config is for. */
function resolve(options: ConnectionOptions) {
	const { host, port, database, user, password, ssl } = new Client(connectionConfig(options))

	return { host, port, database, user, password, ssl }
}

describe('connectionConfig', () => {
	it('takes the connection params from the URL', () => {
		expect(resolve({ url: 'postgres://myuser:mypass@dbhost:5433/mydb' })).toEqual({
			host: 'dbhost',
			port: 5433,
			database: 'mydb',
			user: 'myuser',
			password: 'mypass',
			ssl: false,
		})
	})

	it('defaults the port to 5432 when the URL has none', () => {
		expect(resolve({ url: 'postgres://user:pass@host/db' }).port).toBe(5432)
	})

	it('decodes a URI-encoded username, password and database', () => {
		const config = resolve({ url: 'postgres://my%40user:p%40ss@host:5432/my%20db' })

		expect(config.user).toBe('my@user')

		expect(config.password).toBe('p@ss')

		expect(config.database).toBe('my db')
	})

	it('reads an IPv6 host without its brackets', () => {
		expect(resolve({ url: 'postgres://user:pass@[::1]:5432/db' }).host).toBe('::1')
	})

	it.each([
		['absent', 'postgres://user:pass@host:5432/db'],
		['disable', 'postgres://user:pass@host:5432/db?sslmode=disable'],
	])('turns TLS off when sslmode is %s', (_mode, url) => {
		expect(resolve({ url }).ssl).toBe(false)
	})

	it('encrypts without verifying the server when sslmode=require has no CA', () => {
		const config = resolve({ url: 'postgres://user:pass@host:5432/db?sslmode=require' })

		expect(config.ssl).toEqual({ rejectUnauthorized: false })
	})

	it('verifies the server against the CA when one is given', () => {
		const ca = '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----'

		const config = resolve({ url: 'postgres://user:pass@host:5432/db?sslmode=require', ca })

		expect(config.ssl).toEqual({ ca })
	})
})
