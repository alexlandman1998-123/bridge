#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const ACCESS_MODE = 'linked_ephemeral'
const RECOVERY_CONFIRMATION = 'I_HAVE_TESTED_PRODUCTION_RECOVERY'
const APPLY_CONFIRMATION = 'RECONCILE_PRODUCTION_HISTORY'
const EXPECTED_LEDGER_COUNT = 433
const ACCESS_EVIDENCE_PATH = path.join('migration-evidence', '2026-07-20-production-access-phase13', 'production-access.json')

const aliases = [
  ['202606010001', '20260601000100', 'partner_routing_rules_phase1'],
  ['202606030007', '20260603000700', 'lead_communication_events'],
  ['202606030008', '20260603000800', 'lead_listing_suggestions'],
  ['202606030009', '20260603000900', 'lead_recommendations'],
  ['202606030010', '20260603001000', 'lead_saved_searches'],
  ['202606030011', '20260603001100', 'communication_delivery_preferences'],
  ['202606040001', '20260604000100', 'onboarding_role_contract_phase2'],
  ['202606040002', '20260604000200', 'workspace_entitlements_phase4'],
  ['202606040004', '20260604000400', 'workspace_entitlement_enforcement_phase5'],
  ['202606040005', '20260604000500', 'workspace_billing_operations_phase6'],
  ['202606050001', '20260605000100', 'bond_bank_relationship_profiles'],
  ['202606080002', '20260608000200', 'commercial_listings_foundation'],
  ['202606090010', '20260609001000', 'created_by_access_remediation'],
  ['202606110004', '20260611000400', 'commercial_transactions_phase2'],
  ['202606110005', '20260611000500', 'commercial_crm_foundation_phase3'],
  ['202606110006', '20260611000600', 'commercial_supply_side_phase4'],
  ['202606110007', '20260611000700', 'commercial_brokerage_os_phase5'],
].map(([canonicalVersion, legacyVersion, name]) => ({ canonicalVersion, legacyVersion, name }))

function parseArgs(argv) {
  const options = { apply: false, json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--plan') options.apply = false
    else if (argument === '--apply') options.apply = true
    else if (argument === '--confirm') options.confirm = argv[++index]
    else if (argument === '--json') options.json = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  return options
}

function usage() {
  console.log('Usage:')
  console.log('  node scripts/supabase-phase14-production-ledger-reconciliation.mjs --plan [--json]')
  console.log(`  node scripts/supabase-phase14-production-ledger-reconciliation.mjs --apply --confirm ${APPLY_CONFIRMATION} [--json]`)
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

function requireGuards() {
  if (String(process.env.SUPABASE_PRODUCTION_PROJECT_REF || '').trim() !== PRODUCTION_PROJECT_REF) {
    throw new Error(`SUPABASE_PRODUCTION_PROJECT_REF must equal ${PRODUCTION_PROJECT_REF}.`)
  }
  if (String(process.env.SUPABASE_PRODUCTION_ACCESS_MODE || '').trim() !== ACCESS_MODE) {
    throw new Error(`SUPABASE_PRODUCTION_ACCESS_MODE must equal ${ACCESS_MODE}.`)
  }
  if (String(process.env.SUPABASE_PRODUCTION_RECOVERY_CONFIRMED || '').trim() !== RECOVERY_CONFIRMATION) {
    throw new Error(`SUPABASE_PRODUCTION_RECOVERY_CONFIRMED must equal ${RECOVERY_CONFIRMATION}.`)
  }
  const linkedRef = readFileSync(path.join('supabase', '.temp', 'project-ref'), 'utf8').trim()
  if (linkedRef !== PRODUCTION_PROJECT_REF) throw new Error('The linked Supabase project is not the fixed production project.')
  const accessEvidence = JSON.parse(readFileSync(ACCESS_EVIDENCE_PATH, 'utf8'))
  if (accessEvidence.status !== 'PRODUCTION_ACCESS_CONFIGURED'
    || accessEvidence.productionProjectRef !== PRODUCTION_PROJECT_REF
    || accessEvidence.accessMode !== ACCESS_MODE
    || !String(accessEvidence.approvedBy || '').trim()) {
    throw new Error('Approved Phase 13 production access evidence is required.')
  }
}

function requireLocalFiles() {
  for (const alias of aliases) {
    const expectedFile = path.join('supabase', 'migrations', `${alias.canonicalVersion}_${alias.name}.sql`)
    if (!existsSync(expectedFile)) throw new Error(`Canonical migration file is missing: ${expectedFile}`)
  }
}

function ledgerRows() {
  const versions = aliases.flatMap((alias) => [alias.canonicalVersion, alias.legacyVersion])
  const sql = `select version, name from supabase_migrations.schema_migrations where version in (${versions.map((version) => `'${version}'`).join(',')}) order by version`
  const response = parseJsonLoose(runSupabase(['db', 'query', '--linked', sql, '--output-format', 'json']))
  return response.rows || []
}

function fullLedgerCount() {
  const response = parseJsonLoose(runSupabase([
    'db', 'query', '--linked',
    'select count(*)::int as count from supabase_migrations.schema_migrations',
    '--output-format', 'json',
  ]))
  return response.rows?.[0]?.count
}

function classify(rows) {
  const byVersion = new Map(rows.map((row) => [String(row.version), String(row.name)]))
  return aliases.map((alias) => {
    const canonicalName = byVersion.get(alias.canonicalVersion) || ''
    const legacyName = byVersion.get(alias.legacyVersion) || ''
    if (canonicalName && canonicalName !== alias.name) throw new Error(`Canonical version ${alias.canonicalVersion} has unexpected name ${canonicalName}.`)
    if (legacyName && legacyName !== alias.name) throw new Error(`Legacy version ${alias.legacyVersion} has unexpected name ${legacyName}.`)
    if (!canonicalName && !legacyName) throw new Error(`Neither ledger alias exists for ${alias.name}.`)
    return {
      ...alias,
      canonicalRecorded: Boolean(canonicalName),
      legacyRecorded: Boolean(legacyName),
      state: canonicalName && legacyName ? 'both_recorded' : (canonicalName ? 'canonical_only' : 'legacy_only'),
    }
  })
}

function repair(status, versions) {
  if (versions.length === 0) return
  runSupabase(['migration', 'repair', '--linked', '--status', status, ...versions])
}

function migrationListSummary() {
  const response = parseJsonLoose(runSupabase(['migration', 'list', '--linked', '--output-format', 'json']))
  const rows = response.migrations || response
  const localOnly = rows.filter((row) => row.local && !row.remote)
  const remoteOnly = rows.filter((row) => row.remote && !row.local)
  const localVersions = new Set(localOnly.map((row) => String(row.local)))
  const remoteVersions = new Set(remoteOnly.map((row) => String(row.remote)))
  const splitVersions = [...localVersions].filter((version) => remoteVersions.has(version))
  const splitSet = new Set(splitVersions)
  return {
    localOnlyCount: localOnly.length,
    remoteOnlyCount: remoteOnly.length,
    legacyRemoteOnlyCount: remoteOnly.filter((row) => aliases.some((alias) => alias.legacyVersion === String(row.remote))).length,
    reviewedCanonicalSplitCount: splitVersions.filter((version) => aliases.some((alias) => alias.canonicalVersion === version)).length,
    pureLocalOnlyCount: localOnly.filter((row) => !splitSet.has(String(row.local))).length,
    pureRemoteOnlyCount: remoteOnly.filter((row) => !splitSet.has(String(row.remote))).length,
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) return usage()
  if (options.apply && options.confirm !== APPLY_CONFIRMATION) {
    throw new Error(`Ledger reconciliation requires --confirm ${APPLY_CONFIRMATION}.`)
  }
  requireGuards()
  requireLocalFiles()
  const ledgerCountBefore = fullLedgerCount()
  if (ledgerCountBefore !== EXPECTED_LEDGER_COUNT) throw new Error(`Expected ${EXPECTED_LEDGER_COUNT} production ledger rows; found ${ledgerCountBefore}.`)
  const before = classify(ledgerRows())
  const listBefore = migrationListSummary()

  if (!options.apply) {
    const result = {
      generatedAt: new Date().toISOString(),
      status: before.every((row) => row.state === 'canonical_only') ? 'PRODUCTION_HISTORY_RECONCILED' : 'PRODUCTION_HISTORY_RECONCILABLE',
      productionProjectRef: PRODUCTION_PROJECT_REF,
      aliasCount: aliases.length,
      ledgerCountBefore,
      states: Object.fromEntries(['legacy_only', 'both_recorded', 'canonical_only'].map((state) => [state, before.filter((row) => row.state === state).length])),
      migrationListBefore: listBefore,
      migrationSqlExecuted: false,
      productionSchemaOrDataMutated: false,
    }
    console.log(options.json ? JSON.stringify(result, null, 2) : `${result.status}: ${result.states.legacy_only} legacy aliases require repair.`)
    return
  }

  const canonicalToRecord = before.filter((row) => !row.canonicalRecorded).map((row) => row.canonicalVersion)
  repair('applied', canonicalToRecord)
  const middle = classify(ledgerRows())
  if (middle.some((row) => !row.canonicalRecorded)) throw new Error('Not all canonical ledger versions were recorded.')

  const legacyToRemove = middle.filter((row) => row.legacyRecorded).map((row) => row.legacyVersion)
  repair('reverted', legacyToRemove)
  const after = classify(ledgerRows())
  if (after.some((row) => row.state !== 'canonical_only')) throw new Error('One or more legacy aliases remain after reconciliation.')
  const ledgerCountAfter = fullLedgerCount()
  if (ledgerCountAfter !== EXPECTED_LEDGER_COUNT) throw new Error(`Ledger count changed unexpectedly to ${ledgerCountAfter}.`)
  const listAfter = migrationListSummary()
  if (listAfter.legacyRemoteOnlyCount !== 0 || listAfter.pureRemoteOnlyCount !== 0
    || listAfter.reviewedCanonicalSplitCount !== aliases.length) {
    throw new Error(`Pure remote-only migration drift remains: ${listAfter.pureRemoteOnlyCount}.`)
  }

  const result = {
    generatedAt: new Date().toISOString(),
    status: 'PRODUCTION_HISTORY_RECONCILED',
    productionProjectRef: PRODUCTION_PROJECT_REF,
    aliasCount: aliases.length,
    canonicalVersionsRecorded: canonicalToRecord.length,
    legacyVersionsRemoved: legacyToRemove.length,
    ledgerCountBefore,
    ledgerCountAfter,
    migrationListBefore: listBefore,
    migrationListAfter: listAfter,
    migrationSqlExecuted: false,
    productionSchemaOrDataMutated: false,
    productionLedgerMutated: canonicalToRecord.length > 0 || legacyToRemove.length > 0,
  }
  console.log(options.json ? JSON.stringify(result, null, 2) : `${result.status}: ${result.aliasCount} timestamp aliases canonicalized.`)
}

try {
  main()
} catch (error) {
  console.error(`Phase 14 production history reconciliation blocked: ${error.message}`)
  process.exitCode = 1
}
