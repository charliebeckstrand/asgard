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
import type { Passkey, User } from 'skuld'
import { getConfig } from './config.js'
import { AuthError } from './errors.js'

export const CHALLENGE_TTL_SECONDS = 5 * 60

function challengeExpiry(): Date {
	return new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000)
}

/**
 * Starts adding a passkey to `user`. Every passkey is discoverable and verifies
 * the user, so it signs in alone, with no email or password.
 */
export async function createRegistrationOptions(
	user: User,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
	const { passkeyRepository, passkeys } = getConfig()

	const existing = await passkeyRepository.getPasskeys(user.id)

	const options = await generateRegistrationOptions({
		rpName: passkeys.domain,
		rpID: passkeys.domain,
		userName: user.email,
		userID: new TextEncoder().encode(user.id),
		attestationType: 'none',
		excludeCredentials: existing.map(({ id, transports }) => ({ id, transports })),
		authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
	})

	await passkeyRepository.createChallenge(options.challenge, user.id, challengeExpiry())

	return options
}

/** Verifies a new passkey against a challenge issued to `userId`, and stores it. */
export async function registerPasskey(
	userId: string,
	response: RegistrationResponseJSON,
): Promise<Passkey> {
	const { passkeyRepository, passkeys } = getConfig()

	const verification = await verifyRegistrationResponse({
		response,
		expectedChallenge: (challenge) => passkeyRepository.useChallenge(challenge, userId),
		expectedOrigin: passkeys.origins,
		expectedRPID: passkeys.domain,
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
	const { passkeyRepository, passkeys } = getConfig()

	const options = await generateAuthenticationOptions({
		rpID: passkeys.domain,
		userVerification: 'required',
	})

	await passkeyRepository.createChallenge(options.challenge, null, challengeExpiry())

	return options
}

/** Verifies a passkey sign-in and returns the user's id. */
export async function authenticatePasskey(
	response: AuthenticationResponseJSON,
	ip?: string,
): Promise<string> {
	const { passkeyRepository, userRepository, passkeys, onSecurityEvent } = getConfig()

	const passkey = await passkeyRepository.findPasskey(response.id)

	const verification = passkey
		? await verifyAuthenticationResponse({
				response,
				expectedChallenge: (challenge) => passkeyRepository.useChallenge(challenge, null),
				expectedOrigin: passkeys.origins,
				expectedRPID: passkeys.domain,
				credential: {
					id: passkey.id,
					publicKey: passkey.public_key,
					counter: passkey.counter,
					transports: passkey.transports,
				},
				requireUserVerification: true,
			}).catch(() => null)
		: null

	if (!passkey || !verification?.verified) {
		if (ip) onSecurityEvent?.({ type: 'login_failed', ip, details: { passkey: response.id } })

		throw new AuthError('invalid_credentials', 'Passkey not recognized')
	}

	await passkeyRepository.setCounter(passkey.id, verification.authenticationInfo.newCounter)

	const user = await userRepository.getUserById(passkey.user_id)

	if (!user?.is_active) {
		throw new AuthError('account_inactive', 'Account is inactive')
	}

	return user.id
}

export async function getPasskeys(userId: string): Promise<Passkey[]> {
	const passkeys = await getConfig().passkeyRepository.getPasskeys(userId)

	return passkeys.map(({ id, created_at }) => ({ id, created_at }))
}

export async function deletePasskey(userId: string, id: string): Promise<void> {
	const result = await getConfig().passkeyRepository.deletePasskey(id, userId)

	if (result === 'not_found') {
		throw new AuthError('passkey_not_found', 'Passkey not found')
	}

	if (result === 'last_admin_passkey') {
		throw new AuthError('last_admin_passkey', 'An admin must keep at least one passkey')
	}
}

export function deleteExpiredChallenges(): Promise<number> {
	return getConfig().passkeyRepository.deleteExpiredChallenges()
}
