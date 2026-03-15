export type WorkspaceType = 'package' | 'app' | 'service'

export type ProcessStatus = 'pending' | 'building' | 'watching' | 'ready' | 'error' | 'stopped'

export interface WorkspaceEntry {
	name: string
	type: WorkspaceType
	path: string
	port?: number
	dependencies: string[]
}

export interface ProcessInfo {
	entry: WorkspaceEntry
	status: ProcessStatus
	url?: string
	logs: string[]
}

export type SortOrder = 'alphabetical' | 'run'

export interface DashboardOptions {
	root: string
	docker: boolean
	filter?: string[]
	order: SortOrder
}
