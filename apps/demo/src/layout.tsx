import type { Child } from 'hono/jsx'

export type LayoutProps = {
	title?: string
	children: Child
}

export function Layout({ title, children }: LayoutProps) {
	const cssHref = process.env.NODE_ENV === 'production' ? '/styles.css' : '/src/styles.css'

	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{title ?? 'Demo'}</title>
				<link rel="stylesheet" href={cssHref} />
				<script defer src="/form-handler.js" />
				<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" />
			</head>

			<body class="min-h-screen bg-white flex items-center justify-center">{children}</body>
		</html>
	)
}
