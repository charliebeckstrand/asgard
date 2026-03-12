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
				</div>

				<Button type="default" size="medium">
					Create account
				</Button>
			</Form>
		</Card>
	)
}
