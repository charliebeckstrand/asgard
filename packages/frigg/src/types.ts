export interface VarConfig {
	type: 'value' | 'secret' | 'ref'
	default?: string
	service?: string
	key?: string
}

export interface Manifest {
	name: string
	port: number
	vars: Record<string, VarConfig>
}

export type EnvironmentData = Record<string, Record<string, string>>

export type ManifestData = Record<string, Manifest>

export interface Issue {
	level: 'error' | 'warning'
	message: string
}
