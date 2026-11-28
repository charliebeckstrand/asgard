import { IpAddressSchema } from '../index.js'

describe('IpAddressSchema', () => {
	it.each(['192.168.1.100', '::1', '2001:db8::8a2e:370:7334'])('accepts %s', (ip) => {
		expect(IpAddressSchema.safeParse(ip).success).toBe(true)
	})

	it.each(['', 'not-an-ip', '999.999.999.999', '192.168.1'])('rejects %j', (ip) => {
		expect(IpAddressSchema.safeParse(ip).success).toBe(false)
	})
})
