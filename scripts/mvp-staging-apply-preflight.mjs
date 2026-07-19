import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requiredMvpOrder = ['202607180046', '202607190001']

function optionsFrom(argv) {
  const options = { ledger: '', changeEvidence: '', canonicalPlan: '' }
  for (const arg of argv) {
    if (arg.startsWith('--ledger=')) options.ledger = arg.slice('--ledger='.length)
    else if (arg.startsWith('--change-evidence=')) options.changeEvidence = arg.slice('--change-evidence='.length)
    else if (arg.startsWith('--canonical-plan=')) options.canonicalPlan = arg.slice('--canonical-plan='.length)
    else throw new Error(`Unknown option: ${arg}`)
  }
  for (const [key, value] of Object.entries(options)) {
    if (!value) throw new Error(`Use --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}=<path>.`)
  }
  return options
}

function readJson(filePath, label) {
  const absolutePath = path.resolve(repoRoot, filePath)
  if (!existsSync(absolutePath)) throw new Error(`${label} file not found: ${filePath}`)
  return { absolutePath, data: JSON.parse(readFileSync(absolutePath, 'utf8')) }
}

function runCheck(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: repoRoot, encoding: 'utf8', env: process.env })
  let report = null
  try { report = JSON.parse(result.stdout) } catch { /* A non-JSON failure is represented by the exit status. */ }
  return { passed: result.status === 0, report }
}

const options = optionsFrom(process.argv.slice(2))
const ledger = readJson(options.ledger, 'Ledger evidence')
const changeEvidence = readJson(options.changeEvidence, 'Staging change evidence')
const canonicalPlan = readJson(options.canonicalPlan, 'Canonical migration plan')
const environment = runCheck('scripts/mvp-staging-environment-check.mjs')
const evidence = runCheck('scripts/mvp-staging-change-evidence-check.mjs', [`--evidence=${options.changeEvidence}`])
const freeze = runCheck('scripts/mvp-migration-freeze-check.mjs', ['--json'])
const blockers = []

if (!environment.passed) blockers.push('staging_environment_not_confirmed')
if (!evidence.passed) blockers.push('staging_change_evidence_invalid')
if (!freeze.passed) blockers.push('migration_freeze_not_permitted')
if (!Array.isArray(ledger.data.appliedVersions)) blockers.push('staging_ledger_invalid')
if (!ledger.data.projectRef) blockers.push('staging_ledger_project_ref_missing')
if (String(changeEvidence.data.projectRef || '') !== String(ledger.data.projectRef || '')) blockers.push('change_evidence_project_ref_mismatch')
if (String(canonicalPlan.data.projectRef || '') !== String(ledger.data.projectRef || '')) blockers.push('canonical_plan_project_ref_mismatch')
if (path.resolve(repoRoot, String(changeEvidence.data.ledgerEvidencePath || '')) !== ledger.absolutePath) blockers.push('change_evidence_ledger_path_mismatch')
if (canonicalPlan.data.status !== 'ready_for_staging_apply') blockers.push('canonical_migration_reconciliation_incomplete')
if (JSON.stringify(canonicalPlan.data.arch9MvpMigrationOrder) !== JSON.stringify(requiredMvpOrder)) blockers.push('canonical_mvp_migration_order_invalid')
if (Array.isArray(canonicalPlan.data.collisionPlan) && canonicalPlan.data.collisionPlan.length) blockers.push('canonical_plan_has_unresolved_timestamp_collisions')

const report = {
  version: 'arch9_mvp_staging_apply_preflight_v1',
  decision: blockers.length ? 'no_go' : 'ready_for_human_approved_staging_apply',
  projectRef: ledger.data.projectRef || null,
  migrationOrder: requiredMvpOrder,
  checks: {
    stagingEnvironment: environment.passed,
    changeEvidence: evidence.passed,
    migrationFreeze: freeze.passed,
    canonicalPlanStatus: canonicalPlan.data.status || null,
  },
  blockers,
  safety: 'This preflight does not link Supabase, run SQL, call db push, or modify a database. A named database owner must execute a separately reviewed, forward-only staging change after this returns ready.',
}

console.log(JSON.stringify(report, null, 2))
if (report.decision !== 'ready_for_human_approved_staging_apply') process.exit(1)
