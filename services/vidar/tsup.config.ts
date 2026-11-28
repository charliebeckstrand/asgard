import base from '../../tsup.config.js'

export default { ...base, entry: { index: 'src/index.ts', client: 'src/client.ts' } }
