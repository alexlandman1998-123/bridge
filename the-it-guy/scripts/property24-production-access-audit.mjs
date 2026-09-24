import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { resolveProperty24EnvironmentCredentials } from '../server/property24/environmentService.js'
import { runProperty24ProductionAccessAudit } from '../server/property24/productionAccessAuditService.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = { agencyId: '', output: '', failOnBlocked: false }
  for (const arg of argv) {
    if (arg === '--fail-on-blocked') options.failOnBlocked = true
    else if (arg.startsWith('--agency-id=')) options.agencyId = arg.slice('--agency-id='.length).trim()
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length).trim()
    else throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

function writeReport(report, output) {
  if (!output) return null
  const target = path.resolve(appRoot, output)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`)
  return target
}

const options = parseArgs(process.argv.slice(2))
const credentials = resolveProperty24EnvironmentCredentials({ env: process.env, environment: 'production' })
const report = await runProperty24ProductionAccessAudit({
  credentials,
  agencyId: options.agencyId || process.env.PROPERTY24_PRODUCTION_AGENCY_ID || process.env.PROPERTY24_DEFAULT_AGENCY_ID,
})
const output = writeReport(report, options.output)
console.log(JSON.stringify({
  status: report.status,
  agencyId: report.agencyId,
  blockers: report.blockers,
  checks: report.checks.map(({ name, status, httpStatus }) => ({ name, status, httpStatus: httpStatus || null })),
  ...(output ? { output } : {}),
}, null, 2))
if (options.failOnBlocked && report.status !== 'READY') process.exitCode = 1
