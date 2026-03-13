import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function useAuth() {
	const navigate = useNavigate()
	const [error, setError] = useState('')
	const [submitting, setSubmitting] = useState(false)

	async function login(email: string, password: string) {
		setError('')
		setSubmitting(true)

		try {
			const res = await fetch('/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password }),
			})

			if (res.ok) {
				navigate('/')

				return
			}

			const data = (await res.json().catch(() => ({}))) as { message?: string }

			setError(data.message || 'Invalid email or password.')
		} catch {
			setError('Something went wrong. Please try again.')
		} finally {
			setSubmitting(false)
		}
	}

	async function register(name: string, email: string, password: string, confirmPassword: string) {
		setError('')
		setSubmitting(true)

		if (password !== confirmPassword) {
			setError('Passwords do not match.')
			setSubmitting(false)

			return
		}

		try {
			const res = await fetch('/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password, name }),
			})

			if (res.ok) {
				navigate('/login?registered=true')

				return
			}

			const data = (await res.json().catch(() => ({}))) as { code?: string }

			setError(
				data.code === 'email_exists'
					? 'An account with that email already exists.'
					: 'Registration failed. Please try again.',
			)
		} catch {
			setError('Something went wrong. Please try again.')
		} finally {
			setSubmitting(false)
		}
	}

	async function logout() {
		await fetch('/auth/logout', { method: 'POST' }).catch(() => {})

		navigate('/login')
	}

	return { error, submitting, login, register, logout }
}
