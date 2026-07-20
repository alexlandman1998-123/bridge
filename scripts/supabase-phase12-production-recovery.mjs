#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import pg from 'pg'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const STAGING_PROJECT_REF = 'vaszuxjeoajeuhlcnzzf'
const EXPECTED_PRODUCTION_LEDGER_COUNT = 433
const EXPECTED_FINGERPRINT_RELATIONS = 5
const ATTEST_CONFIRMATION = 'PRODUCTION_RECOVERY_PROVEN'
const PHASE11_EVIDENCE = 'migration-evidence/2026-07-20-staging-phase11/staging-release-certification.json'

const fingerprintSql = `
select 'auth.users' relation, count(*)::int row_count,
       md5(coalesce(string_agg(id::text, ',' order by id::text), '')) id_fingerprint
from auth.users
union all
select 'public.organisations', count(*)::int,
       md5(coalesce(string_agg(id::text, ',' order by id::text), ''))
from public.organisations
union all
select 'public.profiles', count(*)::int,
       md5(coalesce(string_agg(id::text, ',' order by id::text), ''))
from public.profiles
union all
select 'public.transaction_attorney_assignments', count(*)::int,
       md5(coalesce(string_agg(id::text, ',' order by id::text), ''))
from public.transaction_attorney_assignments
union all
select 'public.transactions', count(*)::int,
       md5(coalesce(string_agg(id::text, ',' order by id::text), ''))
from public.transactions
order by relation
`

function parseArgs(argv) {
  const options = { attest: false, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--verify') options.attest = false
    else if (argument === '--attest') options.attest = true
    else if (argument === '--approved-by') options.approvedBy = argv[++index]
    else if (argument === '--confirm') options.confirm = argv[++index]
    else if (argument === '--json') options.json = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  return options
}

function usage() {
  console.log('Usage:')
  console.log('  node scripts/supabase-phase12-production-recovery.mjs --verify [--json]')
  console.log(`  node scripts/supabase-phase12-production-recovery.mjs --attest --approved-by <name> --confirm ${ATTEST_CONFIRMATION} [--json]`)
}

function parseJsonLoose(value) {
  const text = String(value || '').trim()
  try { return JSON.parse(text) } catch {
    const starts = [text.indexOf('{'), text.indexOf('[')].filter((index) => index >= 0).sort((a, b) => a - b)
    if (starts.length === 0) throw new Error('Supabase CLI did not return JSON.')
    return JSON.parse(text.slice(starts[0]))
  }
}

function runSupabase(args) {
  return execFileSync('npx', ['--yes', 'supabase@latest', ...args], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  })
}

function requireTargets() {
  const linkedRef = readFileSync('supabase/.temp/project-ref', 'utf8').trim()
  if (linkedRef !== PRODUCTION_PROJECT_REF) throw new Error('The repository is not linked to the fixed production project.')
  const projectRef = String(process.env.SUPABASE_STAGING_PROJECT_REF || '').trim()
  const dbUrl = String(process.env.SUPABASE_STAGING_DB_URL || '').trim()
  if (projectRef !== STAGING_PROJECT_REF) throw new Error(`SUPABASE_STAGING_PROJECT_REF must equal ${STAGING_PROJECT_REF}.`)
  if (!dbUrl) throw new Error('SUPABASE_STAGING_DB_URL is required.')
  let decodedDbUrl = dbUrl
  try { decodedDbUrl = decodeURIComponent(dbUrl) } catch { /* retain original for identity check */ }
  if (!decodedDbUrl.includes(projectRef)) throw new Error('The staging database URL does not match the staging project reference.')
  return { dbUrl }
}

function platformRecoveryState() {
  const projects = parseJsonLoose(runSupabase(['projects', 'list', '--output', 'json']))
  const production = projects.find((project) => project.ref === PRODUCTION_PROJECT_REF)
  const restored = projects.find((project) => project.ref === STAGING_PROJECT_REF)
  if (!production || production.status !== 'ACTIVE_HEALTHY') throw new Error('Production is not healthy or visible.')
  if (!restored || restored.status !== 'ACTIVE_HEALTHY') throw new Error('The restored staging project is not healthy or visible.')
  if (production.organization_id !== restored.organization_id) throw new Error('Production and restored staging are not in the same organization.')
  if (production.region !== restored.region) throw new Error('Production and restored staging are not in the same region.')

  const backupStatus = parseJsonLoose(runSupabase(['backups', 'list', '--project-ref', PRODUCTION_PROJECT_REF, '--output-format', 'json']))
  const backups = (backupStatus.backups || [])
    .filter((backup) => backup.is_physical_backup === true && backup.status === 'COMPLETED')
    .sort((a, b) => String(b.inserted_at).localeCompare(String(a.inserted_at)))
  if (backupStatus.walg_enabled !== true || backups.length === 0) throw new Error('No completed production physical backup is available.')
  const restoreProjectCreatedAt = new Date(restored.created_at)
  const sourceBackup = backups.find((backup) => new Date(backup.inserted_at) < restoreProjectCreatedAt)
  if (!sourceBackup) throw new Error('No completed production backup predates the restored staging project.')

  return {
    production,
    restored,
    backupStatus,
    backups,
    sourceBackup,
  }
}

function productionQuery(sql) {
  const response = parseJsonLoose(runSupabase(['db', 'query', '--linked', sql, '--output-format', 'json']))
  if (!Array.isArray(response.rows)) throw new Error('Production read-only query returned no rows.')
  return response.rows
}

async function databaseRecoveryState(client) {
  const productionFingerprints = productionQuery(fingerprintSql)
  const stagingFingerprints = (await client.query(fingerprintSql)).rows
  if (productionFingerprints.length !== EXPECTED_FINGERPRINT_RELATIONS || stagingFingerprints.length !== EXPECTED_FINGERPRINT_RELATIONS) {
    throw new Error('The recovery fingerprint relation set is incomplete.')
  }
  const stagingByRelation = new Map(stagingFingerprints.map((row) => [row.relation, row]))
  const comparisons = productionFingerprints.map((production) => {
    const staging = stagingByRelation.get(production.relation)
    return {
      relation: production.relation,
      productionRowCount: production.row_count,
      restoredRowCount: staging?.row_count ?? null,
      rowCountMatch: staging?.row_count === production.row_count,
      idFingerprint: production.id_fingerprint,
      idFingerprintMatch: staging?.id_fingerprint === production.id_fingerprint,
    }
  })
  if (comparisons.some((comparison) => !comparison.rowCountMatch || !comparison.idFingerprintMatch)) {
    throw new Error('The restored staging database does not match production identity fingerprints.')
  }

  const productionLedger = productionQuery('select version from supabase_migrations.schema_migrations order by version')
  if (productionLedger.length !== EXPECTED_PRODUCTION_LEDGER_COUNT) {
    throw new Error(`Expected ${EXPECTED_PRODUCTION_LEDGER_COUNT} production ledger rows; found ${productionLedger.length}.`)
  }
  const productionVersions = productionLedger.map((row) => String(row.version))
  const stagingLedger = await client.query(`
    select version from supabase_migrations.schema_migrations
    where version = any($1::text[])
  `, [productionVersions])
  if (stagingLedger.rowCount !== productionVersions.length) {
    throw new Error('The restored staging ledger does not contain the full production ledger baseline.')
  }

  return {
    fingerprintComparisons: comparisons,
    matchedRelationCount: comparisons.length,
    matchedIdentityRowCount: comparisons.reduce((sum, row) => sum + row.productionRowCount, 0),
    productionLedgerCount: productionLedger.length,
    restoredProductionLedgerCount: stagingLedger.rowCount,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) return usage()
  if (options.attest) {
    if (!String(options.approvedBy || '').trim()) throw new Error('--approved-by is required for recovery attestation.')
    if (options.confirm !== ATTEST_CONFIRMATION) throw new Error(`Recovery attestation requires --confirm ${ATTEST_CONFIRMATION}.`)
  }
  const phase11 = JSON.parse(readFileSync(PHASE11_EVIDENCE, 'utf8'))
  if (phase11.status !== 'STAGING_CERTIFIED' || !String(phase11.approvedBy || '').trim()) {
    throw new Error('Phase 11 staging certification is missing or unapproved.')
  }

  const target = requireTargets()
  const platform = platformRecoveryState()
  const client = new pg.Client({ connectionString: target.dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    const database = await databaseRecoveryState(client)
    const result = {
      generatedAt: new Date().toISOString(),
      status: options.attest ? 'PRODUCTION_DATABASE_RECOVERY_PROVEN' : 'PRODUCTION_DATABASE_RECOVERY_PROVABLE',
      productionProjectRef: PRODUCTION_PROJECT_REF,
      restoredProjectRef: STAGING_PROJECT_REF,
      productionProjectStatus: platform.production.status,
      restoredProjectStatus: platform.restored.status,
      organizationMatch: true,
      regionMatch: true,
      backupMechanism: platform.backupStatus.walg_enabled === true ? 'physical_walg' : 'unknown',
      pitrEnabled: platform.backupStatus.pitr_enabled === true,
      completedPhysicalBackupCount: platform.backups.length,
      sourceBackup: {
        id: platform.sourceBackup.id,
        status: platform.sourceBackup.status,
        insertedAt: platform.sourceBackup.inserted_at,
        predatesRestoredProject: true,
      },
      restoredProjectCreatedAt: platform.restored.created_at,
      ...database,
      databaseConnectivityCheck: 'pass',
      databaseRestoreValidation: 'pass',
      storageObjectRecoveryTested: false,
      platformConfigurationRecoveryTested: false,
      approvedBy: options.attest ? String(options.approvedBy).trim() : '',
      approvalSource: options.attest ? 'explicit_phase12_user_instruction' : '',
      productionMutated: false,
    }
    console.log(options.json ? JSON.stringify(result, null, 2) : `${result.status}: ${result.matchedIdentityRowCount} restored row identities matched across ${result.matchedRelationCount} relations.`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(`Phase 12 production recovery blocked: ${error.message}`)
  process.exitCode = 1
})
