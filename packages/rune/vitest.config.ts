import { createVitestConfig } from 'vali/config'

export default createVitestConfig({
	coverage: { include: ['src/**/*.{ts,tsx}'] },
})
