import { HTTPException } from 'grid'

const DATA_STATUS = {
	'photo-not-yours': 400,
	'visit-outside-trip': 400,
	'trip-days-exclude-visits': 409,
	'photo-missing': 409,
} as const

type DataErrorCode = keyof typeof DATA_STATUS

/** A refused write that names itself, so an app can act on it without matching the message. */
export class DataError extends HTTPException {
	constructor(
		public readonly code: DataErrorCode,
		message: string,
	) {
		super(DATA_STATUS[code], { message })
		this.name = 'DataError'
	}
}
