import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createProperty24MigrationDryRun } from '../server/property24/migrationImportService.js'

const scriptPath = fileURLToPath(import.meta.url)
const appRoot = fileURLToPath(new URL('..', import.meta.url))

export function parseProperty24MigrationDryRunArgs(argv = []) {
  const options = {
    agents: '',
    listings: '',
    images: '',
    agencyId: null,
    output: path.join(appRoot, 'outputs/property24-migration-import-dry-run.json'),
    strict: false,
  }
  for (const arg of argv) {
    if (arg === '--strict') options.strict = true
    else if (arg === '--apply') throw new Error('This command is dry-run-only and does not support --apply.')
    else if (arg.startsWith('--agents=')) options.agents = arg.slice('--agents='.length).trim()
    else if (arg.startsWith('--listings=')) options.listings = arg.slice('--listings='.length).trim()
    else if (arg.startsWith('--images=')) options.images = arg.slice('--images='.length).trim()
    else if (arg.startsWith('--agency-id=')) options.agencyId = arg.slice('--agency-id='.length).trim()
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length).trim()
    else throw new Error(`Unknown option: ${arg}`)
  }
  for (const key of ['agents', 'listings', 'images']) {
    if (!options[key]) throw new Error(`--${key}=<csv-path> is required.`)
  }
  return options
}

function resolveFile(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
}

function readInput(filePath) {
  const resolvedPath = resolveFile(filePath)
  return {
    path: resolvedPath,
    text: fs.readFileSync(resolvedPath, 'utf8'),
  }
}

async function writeJsonAtomic(filePath, value) {
  const resolvedPath = resolveFile(filePath)
  const temporaryPath = `${resolvedPath}.${process.pid}.tmp`
  await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true })
  try {
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await fs.promises.rename(temporaryPath, resolvedPath)
  } finally {
    await fs.promises.unlink(temporaryPath).catch(() => {})
  }
  return resolvedPath
}

export async function runProperty24MigrationDryRun(argv = process.argv.slice(2)) {
  const options = parseProperty24MigrationDryRunArgs(argv)
  const report = createProperty24MigrationDryRun({
    agents: readInput(options.agents),
    listings: readInput(options.listings),
    images: readInput(options.images),
    expectedAgencyId: options.agencyId,
  })
  const output = await writeJsonAtomic(options.output, report)
  const result = {
    phase: report.phase,
    mode: report.mode,
    status: report.status,
    output,
    agency: report.agency,
    summary: report.summary,
    relationships: report.relationships,
    safety: report.safety,
    issueSample: report.issues.slice(0, 10),
  }
  console.log(JSON.stringify(result, null, 2))
  if (report.status === 'BLOCKED' || (options.strict && report.summary.warningCount > 0)) process.exitCode = 1
  return { report, output }
}

if (path.resolve(process.argv[1] || '') === path.resolve(scriptPath)) {
  runProperty24MigrationDryRun().catch((error) => {
    console.error(JSON.stringify({
      phase: 'property24-migration-import-phase1-dry-run',
      mode: 'dry-run',
      status: 'FAILED',
      message: error.message,
      safety: {
        property24WritesPerformed: false,
        databaseWritesPerformed: false,
      },
    }, null, 2))
    process.exitCode = 1
  })
}
