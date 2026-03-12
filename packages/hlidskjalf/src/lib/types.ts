export type WorkspaceType = 'package' | 'service'

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

export interface DashboardOptions {
	root: string
	docker: boolean
	filter?: string[]
}
