import { migratePhotos } from './handlers/photo-migration.js'
import { migratePhotoViews } from './handlers/photo-views.js'
import { db } from './lib/db.js'

// Operator commands, run where Mimir's environment is set. Each named command
// runs in order. App Platform runs a job's command with no shell, so a job runs
// several commands as one call, not with `&&`:
//   node dist/cli.js migrate-photos migrate-photo-views

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

const names = process.argv.slice(2)

if (names.length === 0 || names.some((name) => !(name in commands))) {
	console.error(`Usage: node dist/cli.js <${Object.keys(commands).join(' | ')}>...`)

	process.exit(1)
}

for (const name of names) console.log(await commands[name]?.())

await db.close()
