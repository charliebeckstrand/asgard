import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function parseKey(hex: string): Buffer {
	return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string, masterKeyHex: string): string {
	const key = parseKey(masterKeyHex)
	const iv = randomBytes(IV_LENGTH)
	const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
	const authTag = cipher.getAuthTag()

	return `${iv.toString('base64')}.${encrypted.toString('base64')}.${authTag.toString('base64')}`
}

export function decrypt(sealed: string, masterKeyHex: string): string {
	const key = parseKey(masterKeyHex)
	const parts = sealed.split('.')

	if (parts.length !== 3) {
		throw new Error('Invalid sealed value format')
	}

	const iv = Buffer.from(parts[0] as string, 'base64')
	const ciphertext = Buffer.from(parts[1] as string, 'base64')
	const authTag = Buffer.from(parts[2] as string, 'base64')

	const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
	decipher.setAuthTag(authTag)

	return decipher.update(ciphertext) + decipher.final('utf8')
}

export function timingSafeCompare(a: string, b: string): boolean {
	const bufA = Buffer.from(a)
	const bufB = Buffer.from(b)

	if (bufA.length !== bufB.length) {
		return false
	}

	return timingSafeEqual(bufA, bufB)
}
