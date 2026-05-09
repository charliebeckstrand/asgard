#!/usr/bin/env tsx
import { discoverManifests, findWorkspaceRoot } from 'grid/manifest'
import { bootstrapDatabases, type DatabaseSpec } from '../bootstrap.js'

const adminUrl = process.env.POSTGRES_ADMIN_URL ?? process.env.DATABASE_URL

if (!adminUrl) {
	console.error('saga-bootstrap: POSTGRES_ADMIN_URL is not set')

	process.exit(1)
}

const workspaceRoot = findWorkspaceRoot()

const manifests = discoverManifests(workspaceRoot)

const specs: DatabaseSpec[] = []

for (const { manifest } of manifests.values()) {
	if (manifest.database) specs.push(manifest.database)
}

if (specs.length === 0) {
	console.log('saga-bootstrap: nothing to bootstrap')

	process.exit(0)
}

const result = await bootstrapDatabases(adminUrl, specs)

for (const role of result.createdRoles) console.log(`created role ${role}`)
for (const name of result.createdDatabases) console.log(`created database ${name}`)

if (result.createdRoles.length === 0 && result.createdDatabases.length === 0) {
	console.log('saga-bootstrap: all roles and databases already present')
}
