import { migratePhotos } from './handlers/photo-migration.js'
import { migratePhotoViews } from './handlers/photo-views.js'
import { db } from './lib/db.js'

// Operator commands, run where Mimir's environment is set:
//   node dist/cli.js migrate-photos
//   node dist/cli.js migrate-photo-views

const commands: Record<string, () => Promise<string>> = {
	'migrate-photos': async () => {
		const { copied, dropped, kept } = await migratePhotos()

		return `Copied ${copied} photos into the bucket. Dropped ${dropped} that hold no image. Kept ${kept} as addresses to try again.`
	},
	'migrate-photo-views': async () => {
		const { moved, missing } = await migratePhotoViews()

		return `Moved ${moved} photos to keys with views. ${missing} were missing from the bucket.`
	},
}

const [name] = process.argv.slice(2)

const command = name === undefined ? undefined : commands[name]

if (!command) {
	console.error(`Usage: node dist/cli.js ${Object.keys(commands).join(' | ')}`)

	process.exit(1)
}

console.log(await command())

await db.close()
