#!/usr/bin/env tsx
import { discoverManifests, findWorkspaceRoot } from 'grid/manifest'
import { bootstrapDatabases, type DatabaseSpec } from '../bootstrap.js'

const adminUrl = process.env.POSTGRES_ADMIN_URL

if (!adminUrl) {
	console.error('POSTGRES_ADMIN_URL is not set')

	process.exit(1)
}

const manifests = discoverManifests(findWorkspaceRoot())

const specs: DatabaseSpec[] = []

for (const { manifest } of manifests.values()) {
	if (manifest.database) specs.push(manifest.database)
}

if (specs.length === 0) {
	console.log('nothing to bootstrap')

	process.exit(0)
}

const result = await bootstrapDatabases(adminUrl, specs)

for (const role of result.createdRoles) console.log(`created role ${role}`)
for (const name of result.createdDatabases) console.log(`created database ${name}`)

if (result.createdRoles.length === 0 && result.createdDatabases.length === 0) {
	console.log('all roles and databases already present')
}
