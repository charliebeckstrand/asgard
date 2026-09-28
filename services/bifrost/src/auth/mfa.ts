import { createHash, randomInt } from 'node:crypto'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import type { Session, User } from 'skuld'
import { getConfig } from './config.js'
import { AuthError } from './errors.js'
import { authenticatePasskey } from './passkeys.js'
import {
	base32Encode,
	decryptSecret,
	encryptSecret,
	generateTotpSecret,
	matchTotp,
	totpUri,
} from './totp.js'
import type { Factors } from './types.js'

export const MAX_FAILED_STEPS = 5

/** How long a second step waits after the last one, past `MAX_FAILED_STEPS` for the user. */
export const FAILED_STEP_WAIT_SECONDS = 15 * 60

/** How long a user's wrong second steps are remembered. */
const FAILED_STEP_TTL_SECONDS = 24 * 60 * 60

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
 * Checks a second factor of the signed-in user and marks the session as past its
 * second step. Each wrong try counts, and the fifth ends the session, so a guess
 * costs a new sign-in. The user also gets `MAX_FAILED_STEPS` wrong tries across
 * all their sessions, then one every fifteen minutes, so signing in again with a
 * known password buys no more guesses at an authenticator code.
 */
export async function verifySession(
	session: Session,
	proof: SecondFactorProof,
	ip?: string,
): Promise<void> {
	const { sessionRepository, mfaRepository, onSecurityEvent } = getConfig()

	const userId = session.user.id

	if (secondFactorMethods(await getFactors(userId)).length === 0) {
		throw new AuthError('no_second_factor', 'Add a passkey or an authenticator app first')
	}

	if (!(await mfaRepository.countFailedStep(userId, MAX_FAILED_STEPS, FAILED_STEP_WAIT_SECONDS))) {
		throw new AuthError('too_many_steps', 'Too many wrong tries. Try again in 15 minutes')
	}

	if (await checkProof(userId, proof)) {
		await mfaRepository.clearFailedSteps(userId)

		await sessionRepository.passSecondStep(session.id)

		return
	}

	if (ip) {
		onSecurityEvent?.({
			type: 'login_failed',
			ip,
			details: { user_id: userId, method: Object.keys(proof)[0] },
		})
	}

	if (await sessionRepository.failSecondStep(session.id, MAX_FAILED_STEPS)) {
		throw new AuthError('sign_in_expired', 'Too many tries. Sign in again')
	}

	throw new AuthError('code_rejected', 'That code or passkey was not accepted')
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

/**
 * Returns an error message when `MFA_ENCRYPTION_KEY` can't read the stored
 * authenticator-app secrets, or null when it can or there are none. Bifrost
 * checks this before it starts, so a lost or changed key fails the deploy while
 * the old version keeps serving, instead of breaking every authenticator app.
 */
export async function checkMfaKey(): Promise<string | null> {
	const { mfaRepository, mfa } = getConfig()

	const secret = await mfaRepository.getLatestSecret()

	if (!secret) return null

	if (!mfa.key) return 'MFA_ENCRYPTION_KEY is unset, but authenticator-app secrets exist'

	try {
		decryptSecret(secret, mfa.key)

		return null
	} catch {
		return 'MFA_ENCRYPTION_KEY does not decrypt the stored authenticator-app secrets'
	}
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

export function deleteStaleFailedSteps(): Promise<number> {
	return getConfig().mfaRepository.deleteStaleFailedSteps(FAILED_STEP_TTL_SECONDS)
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
