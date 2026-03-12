import type { Child } from 'hono/jsx'

export type LayoutProps = {
	title?: string
	children: Child
}

export function Layout({ title, children }: LayoutProps) {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{title ?? 'Demo'}</title>
				<script src="https://cdn.tailwindcss.com" />
			</head>

			<body class="min-h-screen bg-gray-50 flex items-center justify-center">{children}</body>
		</html>
	)
}
