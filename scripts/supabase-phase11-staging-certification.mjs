#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const STAGING_PROJECT_REF = 'vaszuxjeoajeuhlcnzzf'
const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const MANIFEST_PATH = path.join('docs', 'supabase-phase-5-application-manifest.json')
const PHASE10_EVIDENCE_PATH = path.join('migration-evidence', '2026-07-20-staging-phase10', 'attorney-assignment-remediation.json')
const PHASE10_COMMIT = 'fd506e46'
const EXPECTED_MANIFEST_ROWS = 71
const APPROVAL_CONFIRMATION = 'CERTIFY_STAGING'

function parseArgs(argv) {
  const options = { certify: false, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--verify') options.certify = false
    else if (argument === '--certify') options.certify = true
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
  console.log('  node scripts/supabase-phase11-staging-certification.mjs --verify [--json]')
  console.log(`  node scripts/supabase-phase11-staging-certification.mjs --certify --approved-by <name> --confirm ${APPROVAL_CONFIRMATION} [--json]`)
}

function stagingTarget() {
  const projectRef = String(process.env.SUPABASE_STAGING_PROJECT_REF || '').trim()
  const dbUrl = String(process.env.SUPABASE_STAGING_DB_URL || '').trim()
  if (projectRef !== STAGING_PROJECT_REF) {
    throw new Error(`SUPABASE_STAGING_PROJECT_REF must equal ${STAGING_PROJECT_REF}.`)
  }
  if (!dbUrl) throw new Error('SUPABASE_STAGING_DB_URL is required.')
  let decodedDbUrl = dbUrl
  try { decodedDbUrl = decodeURIComponent(dbUrl) } catch { /* retain original for identity check */ }
  if (!decodedDbUrl.includes(projectRef)) throw new Error('The staging database URL does not match the staging project reference.')
  return { projectRef, dbUrl }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function evidenceFiles() {
  const files = []
  for (const directoryName of readdirSync('migration-evidence')) {
    const directory = path.join('migration-evidence', directoryName)
    try {
      for (const fileName of readdirSync(directory)) {
        if (fileName.endsWith('.json')) files.push(path.join(directory, fileName))
      }
    } catch { /* ignore non-directories */ }
  }
  return files.sort()
}

function validateManifestEvidence(manifest) {
  if (manifest.linkedProjectRef !== PRODUCTION_PROJECT_REF) throw new Error('Manifest production identity is unexpected.')
  if (!Array.isArray(manifest.rows) || manifest.rows.length !== EXPECTED_MANIFEST_ROWS) {
    throw new Error(`Expected ${EXPECTED_MANIFEST_ROWS} manifest rows.`)
  }
  const parsed = evidenceFiles().map((file) => ({ file, raw: readFileSync(file, 'utf8') }))
    .map((entry) => ({ ...entry, evidence: JSON.parse(entry.raw) }))
  const selected = []
  for (const row of manifest.rows) {
    const candidates = parsed.filter(({ evidence }) =>
      String(evidence.version || '') === row.version
      && String(evidence.stagingProjectRef || evidence.targetProjectRef || '') === STAGING_PROJECT_REF
      && (evidence.stagingLedgerRecorded === true || evidence.sqlApplied === true)
      && evidence.catalogChecks === 'pass'
      && evidence.behaviorChecks === 'pass'
      && evidence.rollbackOrNoResidue === 'pass'
      && String(evidence.approvedBy || evidence.reviewedBy || '').trim()
    )
    if (candidates.length !== 1) {
      throw new Error(`Manifest version ${row.version} must have exactly one complete staging evidence file; found ${candidates.length}.`)
    }
    selected.push({ version: row.version, file: candidates[0].file, digest: sha256(candidates[0].raw) })
  }
  return selected
}

function gitReleaseState(manifest) {
  execFileSync('git', ['merge-base', '--is-ancestor', PHASE10_COMMIT, 'HEAD'], { stdio: 'ignore' })
  const releasePaths = [
    MANIFEST_PATH,
    PHASE10_EVIDENCE_PATH,
    ...manifest.rows.map((row) => path.join('supabase', 'migrations', row.file)),
  ]
  const dirty = execFileSync('git', ['status', '--porcelain', '--', ...releasePaths], { encoding: 'utf8' }).trim()
  if (dirty) throw new Error('One or more certified release inputs have uncommitted changes.')
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

async function liveCertificationState(client, manifest) {
  const versions = manifest.rows.map((row) => row.version)
  const ledger = await client.query(`
    select version
    from supabase_migrations.schema_migrations
    where version = any($1::text[])
    order by version
  `, [versions])
  const ledgerVersions = new Set(ledger.rows.map((row) => String(row.version)))
  const missingLedgerVersions = versions.filter((version) => !ledgerVersions.has(version))
  if (missingLedgerVersions.length > 0) {
    throw new Error(`Staging ledger is missing ${missingLedgerVersions.length} manifest versions.`)
  }

  const integrity = await client.query(`
    select
      count(*)::integer as row_count,
      count(*) filter (where integrity_status <> 'healthy')::integer as blocking_rows,
      coalesce(sum(ineligible_open_assignment_count), 0)::integer as blocking_assignments,
      count(distinct firm_id)::integer as firm_count
    from public.attorney_role_integrity_v1
  `)
  const integrityState = integrity.rows[0]
  if (integrityState.blocking_rows !== 0 || integrityState.blocking_assignments !== 0) {
    throw new Error('The live staging attorney-integrity gate is blocked.')
  }

  const phase10 = JSON.parse(readFileSync(PHASE10_EVIDENCE_PATH, 'utf8'))
  const remediation = await client.query(`
    select
      count(*)::integer as event_count,
      count(distinct transaction_id)::integer as transaction_count
    from public.transaction_events
    where event_data ->> 'remediationRunId' = $1
  `, [phase10.remediationRunId])
  if (remediation.rows[0].event_count !== 43 || remediation.rows[0].transaction_count !== 43) {
    throw new Error('Phase 10 remediation audit evidence is incomplete in staging.')
  }

  const firmCertification = await client.query(`
    select status, certification_version, integrity_row_count
    from public.attorney_role_release_certifications
    where firm_id = $1 and certification_version = 'phase9-v1'
  `, [phase10.targetFirmId])
  if (firmCertification.rows[0]?.status !== 'certified') {
    throw new Error('The remediated firm does not have a live Phase 9 certification.')
  }

  return {
    ledgerRecordedCount: ledger.rowCount,
    integrity: {
      rowCount: integrityState.row_count,
      blockingRows: integrityState.blocking_rows,
      blockingAssignments: integrityState.blocking_assignments,
      firmCount: integrityState.firm_count,
    },
    phase10AuditEventCount: remediation.rows[0].event_count,
    phase10AuditTransactionCount: remediation.rows[0].transaction_count,
    remediatedFirmCertification: {
      status: firmCertification.rows[0].status,
      version: firmCertification.rows[0].certification_version,
      integrityRowCount: firmCertification.rows[0].integrity_row_count,
    },
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) return usage()
  if (options.certify) {
    if (!String(options.approvedBy || '').trim()) throw new Error('--approved-by is required for certification.')
    if (options.confirm !== APPROVAL_CONFIRMATION) {
      throw new Error(`Certification requires --confirm ${APPROVAL_CONFIRMATION}.`)
    }
  }

  const target = stagingTarget()
  const manifestRaw = readFileSync(MANIFEST_PATH, 'utf8')
  const manifest = JSON.parse(manifestRaw)
  const selectedEvidence = validateManifestEvidence(manifest)
  const releaseCommit = gitReleaseState(manifest)
  const client = new pg.Client({ connectionString: target.dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    const live = await liveCertificationState(client, manifest)
    const result = {
      generatedAt: new Date().toISOString(),
      status: options.certify ? 'STAGING_CERTIFIED' : 'STAGING_CERTIFIABLE',
      stagingProjectRef: target.projectRef,
      productionProjectRef: PRODUCTION_PROJECT_REF,
      releaseCommit,
      manifestRowCount: manifest.rows.length,
      manifestSha256: sha256(manifestRaw),
      stagingEvidenceCount: selectedEvidence.length,
      stagingEvidenceSetSha256: sha256(JSON.stringify(selectedEvidence)),
      ...live,
      approvedBy: options.certify ? String(options.approvedBy).trim() : '',
      approvalSource: options.certify ? 'explicit_phase11_user_instruction' : '',
      productionMutated: false,
    }
    console.log(options.json ? JSON.stringify(result, null, 2) : `${result.status}: ${result.stagingEvidenceCount}/${result.manifestRowCount} evidence rows, ${result.integrity.blockingAssignments} integrity blockers.`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(`Phase 11 staging certification blocked: ${error.message}`)
  process.exitCode = 1
})
