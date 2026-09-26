import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from 'node:crypto'

// RFC 6238 with the parameters every authenticator app supports: SHA-1, six
// digits, a 30-second step.

export const TOTP_STEP_SECONDS = 30

const DIGITS = 6

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array): string {
	let bits = 0
	let value = 0
	let out = ''

	for (const byte of bytes) {
		value = (value << 8) | byte
		bits += 8

		while (bits >= 5) {
			out += BASE32[(value >>> (bits - 5)) & 31]
			bits -= 5
		}
	}

	if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]

	return out
}

/** A new 160-bit secret, the size RFC 4226 recommends. */
export function generateTotpSecret(): Buffer {
	return randomBytes(20)
}

export function totpStep(now = Date.now()): number {
	return Math.floor(now / 1000 / TOTP_STEP_SECONDS)
}

export function totpCode(secret: Uint8Array, step: number): string {
	const counter = Buffer.alloc(8)

	counter.writeBigUInt64BE(BigInt(step))

	const mac = createHmac('sha1', secret).update(counter).digest()

	const offset = (mac[mac.length - 1] ?? 0) & 0xf

	const binary = mac.readUInt32BE(offset) & 0x7fffffff

	return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

/**
 * Returns the step `code` belongs to, allowing one step of clock drift either
 * way, or null when it matches none.
 */
export function matchTotp(secret: Uint8Array, code: string, now = Date.now()): number | null {
	if (!/^\d{6}$/.test(code)) return null

	const current = totpStep(now)

	for (const step of [current - 1, current, current + 1]) {
		if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code))) return step
	}

	return null
}

/** The URI an authenticator app reads from a QR code. */
export function totpUri(secret: Uint8Array, issuer: string, account: string): string {
	const label = encodeURIComponent(`${issuer}:${account}`)

	const params = new URLSearchParams({
		secret: base32Encode(secret),
		issuer,
		algorithm: 'SHA1',
		digits: String(DIGITS),
		period: String(TOTP_STEP_SECONDS),
	})

	return `otpauth://totp/${label}?${params}`
}

// Secrets are stored encrypted, so a leaked table can't mint codes. AES-256-GCM,
// stored as IV (12 bytes) + tag (16 bytes) + ciphertext.

function aesKey(key: string): Buffer {
	return createHash('sha256').update(key).digest()
}

export function encryptSecret(secret: Uint8Array, key: string): Buffer {
	const iv = randomBytes(12)

	const cipher = createCipheriv('aes-256-gcm', aesKey(key), iv)

	const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()])

	return Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
}

export function decryptSecret(stored: Uint8Array, key: string): Buffer {
	const data = Buffer.from(stored)

	const decipher = createDecipheriv('aes-256-gcm', aesKey(key), data.subarray(0, 12))

	decipher.setAuthTag(data.subarray(12, 28))

	return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()])
}
