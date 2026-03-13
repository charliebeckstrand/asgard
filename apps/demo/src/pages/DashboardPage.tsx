import { Button } from 'rune'

import { useAuth } from '@/hooks/useAuth'

export function DashboardPage() {
	const { logout } = useAuth()

	return (
		<div className="text-center space-y-4">
			<h1 className="text-3xl font-semibold">Welcome</h1>

			<p className="text-gray-600">You are signed in.</p>

			<Button type="secondary" size="medium" onClick={logout}>
				Sign out
			</Button>
		</div>
	)
}
