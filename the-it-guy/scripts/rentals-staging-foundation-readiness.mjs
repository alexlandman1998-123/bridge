import { spawnSync } from 'node:child_process'
import {
  assessRentalStagingFoundation,
  parseSupabaseMigrationTable,
  parseSupabaseJson,
} from '../src/services/rentals/rentalStagingFoundationReadiness.js'

const REQUIRED_OBJECT_SQL = `select
  to_regclass('public.rental_properties') as rental_properties,
  to_regclass('public.rental_units') as rental_units,
  to_regclass('public.rental_vacancies') as rental_vacancies,
  to_regclass('public.rental_property_mandates') as rental_property_mandates,
  to_regclass('public.rental_applications') as rental_applications,
  to_regclass('public.rental_tenancies') as rental_tenancies,
  to_regprocedure('public.rental_set_updated_at()') as rental_set_updated_at;`

function readOption(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : ''
}

function runSupabase(args) {
  const result = spawnSync('supabase', args, { encoding: 'utf8' })
  const output = `${result.stdout || ''}\n${result.stderr || ''}`
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Supabase command failed: ${output.trim()}`)
  return output
}

const projectRef = readOption('--project-ref') || process.env.RENTAL_STAGING_PROJECT_REF || ''
const reportOnly = process.argv.includes('--report-only')

if (!projectRef) {
  throw new Error('Provide --project-ref or RENTAL_STAGING_PROJECT_REF. This command never chooses a database implicitly.')
}

const migrationOutput = runSupabase([
  'migration', 'list', '--linked', '--project-ref', projectRef,
])
let migrations
try {
  migrations = parseSupabaseJson(migrationOutput).migrations || []
} catch {
  migrations = parseSupabaseMigrationTable(migrationOutput)
}
const catalogPayload = parseSupabaseJson(runSupabase([
  'db', 'query', '--linked', '--project-ref', projectRef, '--output', 'json', REQUIRED_OBJECT_SQL,
]))
const assessment = assessRentalStagingFoundation({
  migrations,
  catalog: catalogPayload.rows?.[0] || {},
})
const report = { projectRef, checkedAt: new Date().toISOString(), ...assessment }

console.log(JSON.stringify(report, null, 2))

if (!reportOnly && !report.ready) process.exitCode = 2
