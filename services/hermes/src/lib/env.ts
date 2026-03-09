import { createEnvLoader } from 'frigg'

export const loadEnv = createEnvLoader()

export type Env = ReturnType<typeof loadEnv>
