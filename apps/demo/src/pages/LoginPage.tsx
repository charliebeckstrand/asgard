import type { SubmitEvent } from 'react'

import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Card, Form, Input, Label } from 'rune'

import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
	const [searchParams] = useSearchParams()

	const { error, submitting, login } = useAuth()

	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')

	const registered = searchParams.get('registered') === 'true'

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault()

		await login(email, password)
	}

	return (
		<div className="w-full min-w-[18rem] space-y-4">
			<h1 className="text-2xl font-semibold text-center">Sign in</h1>

			{registered && (
				<p className="text-sm text-green-500 text-center">
					Account created successfully. Please sign in.
				</p>
			)}

			{error && <p className="text-sm text-red-500 text-center">{error}</p>}

			<Card>
				<Form onSubmit={handleSubmit}>
					<div className="flex flex-col gap-2">
						<Label htmlFor="email">Email</Label>

						<Input
							inputType="email"
							name="email"
							id="email"
							placeholder="you@example.com"
							required
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="password">Password</Label>

						<Input
							inputType="password"
							name="password"
							id="password"
							placeholder="Password"
							required
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</div>

					<Button type="default" disabled={submitting}>
						Sign in
					</Button>
				</Form>
			</Card>

			<p className="text-sm text-center text-gray-500">
				Don't have an account?{' '}
				<Link to="/register" className="text-blue hover:underline">
					Create one
				</Link>
			</p>
		</div>
	)
}
