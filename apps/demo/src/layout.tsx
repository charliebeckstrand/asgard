import { raw } from 'hono/html'
import type { Child } from 'hono/jsx'

export type LayoutProps = {
	title?: string
	children: Child
}

const livereloadScript = raw(`<script>
(function(){
	function connect() {
		var es = new EventSource('/__livereload')

		es.onmessage = function() {
			var link = document.querySelector('link[href^="/styles.css"]')

			if (link) {
				link.href = '/styles.css?' + Date.now()
			}

			setTimeout(function(){ location.reload() }, 100)
		}

		es.onerror = function() {
			es.close()

			setTimeout(connect, 1000)
		}
	}

	connect()
})()
</script>`)

export function Layout({ title, children }: LayoutProps) {
	const isDev = process.env.NODE_ENV !== 'production'

	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{title ?? 'Demo'}</title>
				<link rel="stylesheet" href="/styles.css" />
			</head>

			<body class="min-h-screen bg-gray-50 flex items-center justify-center">
				{children}
				{isDev && livereloadScript}
			</body>
		</html>
	)
}
