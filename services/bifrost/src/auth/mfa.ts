import { createHash, randomBytes, randomInt } from 'node:crypto'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import type { User } from 'skuld'
import { getConfig } from './config.js'
import { AuthError } from './errors.js'
import { authenticatePasskey } from './passkeys.js'
import { hashToken } from './sessions.js'
import {
	base32Encode,
	decryptSecret,
	encryptSecret,
	generateTotpSecret,
	matchTotp,
	totpUri,
} from './totp.js'
import type { Factors } from './types.js'

export const TICKET_TTL_SECONDS = 5 * 60

export const MAX_TICKET_ATTEMPTS = 5

export const RECOVERY_CODE_COUNT = 10

export type SecondFactorMethod = 'passkey' | 'totp' | 'recovery_code'

export type SecondFactorProof =
	| { passkey: AuthenticationResponseJSON }
	| { totp: string }
	| { recovery_code: string }

export function getFactors(userId: string): Promise<Factors> {
	return getConfig().mfaRepository.getFactors(userId)
}

/** The methods that can finish a sign-in, or none when two-step sign-in is off. */
export function secondFactorMethods(factors: Factors): SecondFactorMethod[] {
	const methods: SecondFactorMethod[] = []

	if (factors.passkeys > 0) methods.push('passkey')

	if (factors.totp) methods.push('totp')

	if (methods.length > 0 && factors.recovery_codes > 0) methods.push('recovery_code')

	return methods
}

/**
 * Holds a sign-in that passed its first factor until the second one. The
 * cookie gets the token; the database keeps only its SHA-256.
 */
export async function createLoginTicket(userId: string): Promise<string> {
	const token = randomBytes(32).toString('base64url')

	await getConfig().mfaRepository.createTicket(
		hashToken(token),
		userId,
		new Date(Date.now() + TICKET_TTL_SECONDS * 1000),
	)

	return token
}

/** The user of a ticket that can still be used, without spending an attempt. */
export async function findLoginTicket(token: string): Promise<string> {
	const userId = await getConfig().mfaRepository.findTicket(hashToken(token), MAX_TICKET_ATTEMPTS)

	if (!userId) {
		throw new AuthError('sign_in_expired', 'Sign in again')
	}

	return userId
}

/**
 * Checks the second factor of the sign-in the ticket holds, and returns the
 * user's id. Each call spends one attempt, so a ticket can't be brute-forced.
 */
export async function completeLoginTicket(
	token: string,
	proof: SecondFactorProof,
	ip?: string,
): Promise<string> {
	const { mfaRepository, userRepository, onSecurityEvent } = getConfig()

	const id = hashToken(token)

	const userId = await mfaRepository.useTicketAttempt(id, MAX_TICKET_ATTEMPTS)

	if (!userId) {
		throw new AuthError('sign_in_expired', 'Sign in again')
	}

	if (!(await checkProof(userId, proof))) {
		const method = Object.keys(proof)[0]

		if (ip) onSecurityEvent?.({ type: 'login_failed', ip, details: { user_id: userId, method } })

		throw new AuthError('invalid_credentials', 'That code or passkey was not accepted')
	}

	await mfaRepository.deleteTicket(id)

	const user = await userRepository.getUserById(userId)

	if (!user?.is_active) {
		throw new AuthError('account_inactive', 'Account is inactive')
	}

	return userId
}

async function checkProof(userId: string, proof: SecondFactorProof): Promise<boolean> {
	const { mfaRepository } = getConfig()

	if ('passkey' in proof) {
		const owner = await authenticatePasskey(proof.passkey).catch(() => null)

		return owner === userId
	}

	if ('recovery_code' in proof) {
		return mfaRepository.useRecoveryCode(userId, hashRecoveryCode(proof.recovery_code))
	}

	const totp = await mfaRepository.getTotp(userId)

	if (!totp?.confirmed) return false

	const step = matchTotp(decryptSecret(totp.secret, mfaKey()), proof.totp)

	return step !== null && mfaRepository.useTotpStep(userId, step)
}

function mfaKey(): string {
	const { key } = getConfig().mfa

	if (!key) {
		throw new AuthError('mfa_unavailable', 'Authenticator apps are not set up on this server')
	}

	return key
}

/**
 * Starts adding an authenticator app. The secret stays pending until
 * {@link confirmTotp}, and a new call replaces a pending one.
 */
export async function startTotpSetup(user: User): Promise<{ secret: string; uri: string }> {
	const { mfaRepository, mfa } = getConfig()

	const secret = generateTotpSecret()

	const result = await mfaRepository.setPendingTotp(user.id, encryptSecret(secret, mfaKey()))

	if (result === 'exists') {
		throw new AuthError('totp_exists', 'Remove the authenticator app before adding another')
	}

	return { secret: base32Encode(secret), uri: totpUri(secret, mfa.issuer, user.email) }
}

/** Turns on the pending authenticator app once it shows a working code. */
export async function confirmTotp(userId: string, code: string): Promise<void> {
	const { mfaRepository } = getConfig()

	const totp = await mfaRepository.getTotp(userId)

	if (!totp || totp.confirmed) {
		throw new AuthError('totp_not_found', 'No authenticator app is waiting to be confirmed')
	}

	const step = matchTotp(decryptSecret(totp.secret, mfaKey()), code)

	if (step === null || !(await mfaRepository.confirmTotp(userId, step))) {
		throw new AuthError('code_rejected', 'That code is not correct')
	}
}

export async function deleteTotp(userId: string): Promise<void> {
	const result = await getConfig().mfaRepository.deleteTotp(userId)

	if (result === 'not_found') {
		throw new AuthError('totp_not_found', 'No authenticator app is set up')
	}

	if (result === 'last_admin_factor') {
		throw new AuthError('last_admin_factor', 'An admin must keep a passkey or an authenticator app')
	}
}

const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function hashRecoveryCode(code: string): string {
	return createHash('sha256')
		.update(code.toLowerCase().replace(/[^a-z0-9]/g, ''))
		.digest('hex')
}

/**
 * Replaces the user's recovery codes with new ones, which are shown this once.
 * Each is ten characters (about 49 bits), written as two groups of five.
 */
export async function generateRecoveryCodes(userId: string): Promise<string[]> {
	const { mfaRepository } = getConfig()

	if (secondFactorMethods(await mfaRepository.getFactors(userId)).length === 0) {
		throw new AuthError('no_second_factor', 'Add a passkey or an authenticator app first')
	}

	const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
		const chars = Array.from(
			{ length: 10 },
			() => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)],
		).join('')

		return `${chars.slice(0, 5)}-${chars.slice(5)}`
	})

	await mfaRepository.replaceRecoveryCodes(userId, codes.map(hashRecoveryCode))

	return codes
}

export function deleteExpiredTickets(): Promise<number> {
	return getConfig().mfaRepository.deleteExpiredTickets()
}
