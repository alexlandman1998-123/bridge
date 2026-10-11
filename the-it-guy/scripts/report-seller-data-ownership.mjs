import { readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSellerRelationshipReport } from '../src/services/listings/listingSellerRelationshipModel.js'
import { SELLER_DATA_FIELDS, SELLER_DATA_OWNERSHIP_VERSION, SELLER_RECORD_OWNERSHIP } from '../src/lib/sellerDataOwnershipContract.js'
import { buildSellerAlignmentSnapshotQuery } from './lib/seller-data-alignment-audit.mjs'
import { buildSellerReconciliationPacket } from './lib/seller-data-reconciliation.mjs'

const args = process.argv.slice(2)
const usage = 'Usage: --contract | --input=<snapshot.json> | --snapshot-sql --project-ref=<ref> --environment=<label> | --reconcile --input=<snapshot.json> [--packet=<private-absolute-path>]. Read-only; apply is unsupported.'
async function readSnapshot(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch { throw new Error('Could not read a valid seller relationship JSON snapshot.') }
}

async function writePrivatePacket(path, packet) {
  if (!isAbsolute(path)) throw new Error('Private packet output must be an absolute path outside the repository.')
  const repository = await realpath(fileURLToPath(new URL('../..', import.meta.url)))
  const parent = await realpath(dirname(path))
  if (parent === repository || parent.startsWith(repository + sep)) throw new Error('Private packet output must be outside the repository.')
  if ((await stat(parent)).mode & 0o077) throw new Error('Private packet directory must permit access only to its owner (mode 0700).')
  // Exclusive creation prevents replacing a reviewed packet or following a
  // pre-existing output symlink. No database connection or apply operation.
  await writeFile(resolve(parent, path.split(sep).at(-1)), JSON.stringify(packet, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
}

try {
  if (args.length === 1 && args[0] === '--contract') {
    console.log(JSON.stringify({ version: SELLER_DATA_OWNERSHIP_VERSION, records: SELLER_RECORD_OWNERSHIP, fields: SELLER_DATA_FIELDS }, null, 2))
  } else if (args.length === 1 && args[0].startsWith('--input=') && args[0].slice(8)) {
    const snapshot = await readSnapshot(args[0].slice(8))
    const report = buildSellerRelationshipReport(snapshot)
    console.log(JSON.stringify(report, null, 2))
    if (report.status !== 'aligned_relationships') process.exitCode = 1
  } else if (args.length === 3 && args.includes('--snapshot-sql') && args.filter(arg => arg.startsWith('--project-ref=')).length === 1 && args.filter(arg => arg.startsWith('--environment=')).length === 1) {
    console.log(buildSellerAlignmentSnapshotQuery({ projectRef: args.find(arg => arg.startsWith('--project-ref=')).slice(14), environmentLabel: args.find(arg => arg.startsWith('--environment=')).slice(14) }))
  } else if ([2, 3].includes(args.length) && args.includes('--reconcile') && args.filter(arg => arg.startsWith('--input=') && arg.slice(8)).length === 1 && args.every(arg => arg === '--reconcile' || arg.startsWith('--input=') || arg.startsWith('--packet='))) {
    const { report, packet } = buildSellerReconciliationPacket(await readSnapshot(args.find(arg => arg.startsWith('--input=')).slice(8)))
    const output = args.find(arg => arg.startsWith('--packet='))?.slice(9)
    if (args.length === 3 && !output) throw new Error(usage)
    if (output) await writePrivatePacket(output, packet)
    console.log(JSON.stringify(report, null, 2))
    // Findings are expected in a dry run. Missing export coverage is a failure.
    if (report.coverage.missingTables.length) process.exitCode = 1
  } else throw new Error(usage)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
