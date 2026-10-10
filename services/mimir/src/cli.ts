import { migratePhotos } from './handlers/photo-migration.js'
import { db } from './lib/db.js'

// Operator commands, run where Mimir's environment is set:
//   node dist/cli.js migrate-photos

const [command] = process.argv.slice(2)

if (command !== 'migrate-photos') {
	console.error('Usage: node dist/cli.js migrate-photos')

	process.exit(1)
}

const { copied, dropped, kept } = await migratePhotos()

console.log(
	`Copied ${copied} photos into the bucket. Dropped ${dropped} that hold no image. Kept ${kept} as addresses to try again.`,
)

await db.close()
