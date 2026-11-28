import {
	type AuthenticationResponseJSON,
	generateAuthenticationOptions,
	generateRegistrationOptions,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { User } from 'skuld'
import { reportEvent } from 'vidar/client'
import { environment } from '../lib/env.js'
import { passkeyRepository, userRepository } from '../lib/repositories.js'
import type { Passkey } from '../lib/schemas.js'
import { AuthError } from './errors.js'
import { expiresIn } from './sessions.js'

export const CHALLENGE_TTL_SECONDS = 5 * 60

/**
 * Starts adding a passkey to `user`. Every passkey is discoverable and verifies
 * the user, so it signs in alone, with no email or password.
 */
export async function createRegistrationOptions(
	user: User,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
	const { PASSKEY_DOMAIN } = environment()

	const existing = await passkeyRepository.getPasskeys(user.id)

	const options = await generateRegistrationOptions({
		rpName: PASSKEY_DOMAIN,
		rpID: PASSKEY_DOMAIN,
		userName: user.email,
		userID: new TextEncoder().encode(user.id),
		attestationType: 'none',
		excludeCredentials: existing.map(({ id, transports }) => ({ id, transports })),
		authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
	})

	await passkeyRepository.createChallenge(
		options.challenge,
		user.id,
		expiresIn(CHALLENGE_TTL_SECONDS),
	)

	return options
}

/** Verifies a new passkey against a challenge issued to `userId`, and stores it. */
export async function registerPasskey(
	userId: string,
	response: RegistrationResponseJSON,
): Promise<Passkey> {
	const { PASSKEY_DOMAIN, APP_ORIGINS } = environment()

	const verification = await verifyRegistrationResponse({
		response,
		expectedChallenge: (challenge) => passkeyRepository.useChallenge(challenge, userId),
		expectedOrigin: APP_ORIGINS,
		expectedRPID: PASSKEY_DOMAIN,
		requireUserVerification: true,
	}).catch(() => null)

	if (!verification?.verified) {
		throw new AuthError('passkey_rejected', 'The passkey could not be verified')
	}

	const { credential } = verification.registrationInfo

	return passkeyRepository.insertPasskey(userId, {
		id: credential.id,
		publicKey: credential.publicKey,
		counter: credential.counter,
		transports: credential.transports ?? [],
	})
}

/** Starts a passkey sign-in. The browser offers every passkey it holds for the domain. */
export async function createSignInOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
	const { PASSKEY_DOMAIN } = environment()

	const options = await generateAuthenticationOptions({
		rpID: PASSKEY_DOMAIN,
		userVerification: 'required',
	})

	await passkeyRepository.createChallenge(options.challenge, null, expiresIn(CHALLENGE_TTL_SECONDS))

	return options
}

/**
 * Starts the passkey step of a sign-in that passed its password. Unlike
 * {@link createSignInOptions}, it names the user's passkeys, so the browser asks
 * only for those.
 */
export async function createSecondFactorOptions(
	userId: string,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
	const { PASSKEY_DOMAIN } = environment()

	const existing = await passkeyRepository.getPasskeys(userId)

	const options = await generateAuthenticationOptions({
		rpID: PASSKEY_DOMAIN,
		userVerification: 'required',
		allowCredentials: existing.map(({ id, transports }) => ({ id, transports })),
	})

	await passkeyRepository.createChallenge(options.challenge, null, expiresIn(CHALLENGE_TTL_SECONDS))

	return options
}

/**
 * The user whose passkey signed `response` against a live challenge, or null
 * when it doesn't verify. Counts the use against the passkey's counter.
 */
export async function verifyPasskey(response: AuthenticationResponseJSON): Promise<string | null> {
	const { PASSKEY_DOMAIN, APP_ORIGINS } = environment()

	const passkey = await passkeyRepository.findPasskey(response.id)

	const verification = passkey
		? await verifyAuthenticationResponse({
				response,
				expectedChallenge: (challenge) => passkeyRepository.useChallenge(challenge, null),
				expectedOrigin: APP_ORIGINS,
				expectedRPID: PASSKEY_DOMAIN,
				credential: {
					id: passkey.id,
					publicKey: passkey.public_key,
					counter: passkey.counter,
					transports: passkey.transports,
				},
				requireUserVerification: true,
			}).catch(() => null)
		: null

	if (!passkey || !verification?.verified) return null

	await passkeyRepository.setCounter(passkey.id, verification.authenticationInfo.newCounter)

	return passkey.user_id
}

/** Verifies a passkey sign-in and returns the user's id. */
export async function authenticatePasskey(
	response: AuthenticationResponseJSON,
	ip: string,
): Promise<string> {
	const userId = await verifyPasskey(response)

	if (!userId) {
		reportEvent({ type: 'login_failed', ip, details: { passkey: response.id } })

		throw new AuthError('invalid_credentials', 'Passkey not recognized')
	}

	const user = await userRepository.getUserById(userId)

	if (!user?.is_active) {
		throw new AuthError('account_inactive', 'Account is inactive')
	}

	return user.id
}

export async function getPasskeys(userId: string): Promise<Passkey[]> {
	const passkeys = await passkeyRepository.getPasskeys(userId)

	return passkeys.map(({ id, created_at }) => ({ id, created_at }))
}

export async function deletePasskey(userId: string, id: string): Promise<void> {
	const result = await passkeyRepository.deletePasskey(id, userId)

	if (result === 'not_found') {
		throw new AuthError('passkey_not_found', 'Passkey not found')
	}

	if (result === 'last_admin_factor') {
		throw new AuthError('last_admin_factor', 'An admin must keep a passkey or an authenticator app')
	}
}

export function deleteExpiredChallenges(): Promise<number> {
	return passkeyRepository.deleteExpiredChallenges()
}
