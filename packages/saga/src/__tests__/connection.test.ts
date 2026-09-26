import { connectionConfig } from '../connection.js'

describe('connectionConfig', () => {
	it('takes the connection params apart from the URL', () => {
		const config = connectionConfig({ url: 'postgres://myuser:mypass@dbhost:5433/mydb' })

		expect(config).toEqual({
			host: 'dbhost',
			port: 5433,
			database: 'mydb',
			user: 'myuser',
			password: 'mypass',
			ssl: false,
		})
	})

	it('defaults the port to 5432 when the URL has none', () => {
		const config = connectionConfig({ url: 'postgres://user:pass@host/db' })

		expect(config.port).toBe(5432)
	})

	it('decodes a URI-encoded username and password', () => {
		const config = connectionConfig({ url: 'postgres://my%40user:p%40ss@host:5432/db' })

		expect(config.user).toBe('my@user')

		expect(config.password).toBe('p@ss')
	})

	it.each([
		['absent', 'postgres://user:pass@host:5432/db'],
		['disable', 'postgres://user:pass@host:5432/db?sslmode=disable'],
	])('turns TLS off when sslmode is %s', (_mode, url) => {
		const config = connectionConfig({ url })

		expect(config.ssl).toBe(false)
	})

	it('encrypts without verifying the server when sslmode=require has no CA', () => {
		const config = connectionConfig({ url: 'postgres://user:pass@host:5432/db?sslmode=require' })

		expect(config.ssl).toEqual({ rejectUnauthorized: false })
	})

	it('verifies the server against the CA when one is given', () => {
		const ca = '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----'

		const config = connectionConfig({
			url: 'postgres://user:pass@host:5432/db?sslmode=require',
			ca,
		})

		expect(config.ssl).toEqual({ ca })
	})
})
