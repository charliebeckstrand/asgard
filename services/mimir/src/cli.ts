import { migratePhotos } from './handlers/photo-migration.js'
import { sweepPhotos } from './handlers/photo-sweep.js'
import { db } from './lib/db.js'
import { environment } from './lib/env.js'

// Operator commands, run where Mimir's environment is set:
//   node dist/cli.js migrate-photos
//   node dist/cli.js sweep-photos

const [command] = process.argv.slice(2)

if (command === 'migrate-photos') {
	const { copied, dropped, kept } = await migratePhotos()

	console.log(
		`Copied ${copied} photos into the bucket. Dropped ${dropped} that hold no image. Kept ${kept} as addresses to try again.`,
	)
} else if (command === 'sweep-photos') {
	const { errors } = await sweepPhotos({ deletes: environment().PHOTO_SWEEP_DELETE })

	// The run's log holds the counts. A failure marks the run failed.
	if (errors > 0) process.exitCode = 1
} else {
	console.error('Usage: node dist/cli.js migrate-photos | sweep-photos')

	process.exit(1)
}

await db.close()
