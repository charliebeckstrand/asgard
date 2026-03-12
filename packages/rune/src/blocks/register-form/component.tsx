import { Button } from '../../button/index.js'
import { Card } from '../../card/index.js'
import { Form } from '../../form/index.js'
import { Input } from '../../input/index.js'
import { Label } from '../../label/index.js'

export type RegisterFormProps = {
	action?: string
	method?: 'get' | 'post' | 'dialog'
	class?: string
}

const validationScript = `
	var pw = document.getElementById('password')
	var cpw = document.getElementById('confirmPassword')
	var err = document.getElementById('confirmPassword-error')

	function validate() {
		if (cpw.value && pw.value !== cpw.value) {
			cpw.setCustomValidity('Passwords do not match')
			if (err) err.textContent = 'Passwords do not match'
		} else {
			cpw.setCustomValidity('')
			if (err) err.textContent = ''
		}
	}

	pw.addEventListener('input', validate)
	cpw.addEventListener('input', validate)
`

export function RegisterForm({ action, method, class: className }: RegisterFormProps) {
	return (
		<Card padding="medium" shadow="small" class={className}>
			<Form action={action} method={method ?? 'post'}>
				<div class="flex flex-col gap-1.5">
					<Label htmlFor="name">Name</Label>

					<Input inputType="text" name="name" id="name" placeholder="Jane Doe" required />
				</div>

				<div class="flex flex-col gap-1.5">
					<Label htmlFor="email">Email</Label>

					<Input inputType="email" name="email" id="email" placeholder="you@example.com" required />
				</div>

				<div class="flex flex-col gap-1.5">
					<Label htmlFor="password">Password</Label>

					<Input
						inputType="password"
						name="password"
						id="password"
						placeholder="Password"
						required
					/>
				</div>

				<div class="flex flex-col gap-1.5">
					<Label htmlFor="confirmPassword">Confirm password</Label>

					<Input
						inputType="password"
						name="confirmPassword"
						id="confirmPassword"
						placeholder="Confirm password"
						required
					/>

					<span id="confirmPassword-error" class="text-xs text-red-500" />
				</div>

				<Button type="default" size="medium">
					Create account
				</Button>
			</Form>

			<script dangerouslySetInnerHTML={{ __html: validationScript }} />
		</Card>
	)
}
