import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

// RETIRED BY ROLL_OUT_6.  This historical activator predates the
// server-owned release-epoch contract and can only widen the v1 environment
// allowlist.  Keeping its implementation below preserves the audit trail,
// but it must never execute or mutate a remote runtime again.
console.log(JSON.stringify({
  phase: 'A3',
  status: 'RETIRED_HOLD',
  errorCode: 'LEGAL_DOCUMENT_LEGACY_EXPANSION_RETIRED',
  message: 'Legacy A3 activation is permanently retired. Use the separately approved server-owned successor-release process; this command made no changes.',
  mutatedData: false,
}, null, 2))
process.exit(1)

const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_A3_WRITE'
const CONFIG_PATH = 'config/legal-document-pilot.json'

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function normalizeIds(value) {
  return [...new Set((Array.isArray(value) ? value : String(value || '').split(',')).map((item) => String(item).trim()).filter(Boolean))].sort()
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function run(command, args, timeout = 120_000) {
  return spawnSync(command, args, { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 })
}

function parseReport(result) {
  try { return JSON.parse(result.stdout) } catch { return null }
}

function listSecrets(projectRef) {
  const result = run('npx', ['supabase', 'secrets', 'list', '--project-ref', projectRef, '--output', 'json'])
  if (result.status !== 0) throw new Error(result.stderr || 'Unable to verify Supabase Edge secrets.')
  return JSON.parse(result.stdout)
}

function secretsMatch(rows, enabledValue, cohortValue) {
  const byName = new Map(rows.map((row) => [row.name, row.value]))
  return byName.get('LEGAL_DOCUMENT_PILOT_ENABLED') === digest(enabledValue) &&
    byName.get('LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS') === digest(cohortValue)
}

const originalText = fs.readFileSync(CONFIG_PATH, 'utf8')
const config = JSON.parse(originalText)
const releaseIds = normalizeIds(config.releasePreparation?.organisationIds || [])
const effectiveIds = normalizeIds(config.organisationIds || [])
const targetProjectRef = arg('project-ref') || config.activation?.targetProjectRef || ''
const confirmProjectRef = arg('confirm-project-ref')
const confirmOrganisationIds = normalizeIds(arg('confirm-organisation-ids'))
const activatedBy = arg('activated-by')
const reference = arg('reference')
const apply = process.argv.includes('--apply')
const a2Run = run(process.execPath, ['scripts/legal-document-phase-a2-readiness.mjs'], 180_000)
const a2 = parseReport(a2Run)
const blockers = []

if (a2?.status !== 'READY_FOR_A3') blockers.push({ code: 'A3_A2_NOT_READY', detail: 'Phase A2 must report READY_FOR_A3 before activation.' })
if (!targetProjectRef) blockers.push({ code: 'A3_TARGET_PROJECT_REF_MISSING', detail: 'Record or supply the exact target Supabase project ref.' })
if (!releaseIds.length) blockers.push({ code: 'A3_RELEASE_COHORT_EMPTY', detail: 'A2 has not approved an organisation cohort.' })
if (releaseIds.join(',') !== effectiveIds.join(',')) blockers.push({ code: 'A3_ALLOWLIST_MISMATCH', detail: 'The effective allowlist must exactly match the A2 release cohort.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'A3_WRITE_FLAG_MISSING', detail: `${WRITE_FLAG}=true is required for activation.` })
if (apply && confirmProjectRef !== targetProjectRef) blockers.push({ code: 'A3_PROJECT_CONFIRMATION_MISMATCH', detail: 'The confirmed project ref must exactly match the target.' })
if (apply && confirmOrganisationIds.join(',') !== releaseIds.join(',')) blockers.push({ code: 'A3_COHORT_CONFIRMATION_MISMATCH', detail: 'The confirmed organisation IDs must exactly match the approved cohort.' })
if (apply && !activatedBy) blockers.push({ code: 'A3_ACTIVATOR_MISSING', detail: 'Record the accountable human activating the pilot.' })
if (apply && !reference) blockers.push({ code: 'A3_REFERENCE_MISSING', detail: 'Record the A3 change/release reference.' })

const report = {
  phase: 'A3',
  mode: apply ? 'apply' : 'dry-run',
  status: blockers.length ? 'BLOCKED' : apply ? 'READY_TO_APPLY' : 'DRY_RUN_READY',
  targetProjectRef: targetProjectRef || null,
  organisationIds: releaseIds,
  a2Status: a2?.status || 'UNAVAILABLE',
  blockers,
  plannedSecrets: ['LEGAL_DOCUMENT_PILOT_ENABLED', 'LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS'],
  mutatedData: false,
}

if (!apply || blockers.length) {
  console.log(JSON.stringify(report, null, 2))
  if (blockers.length) process.exitCode = 1
} else {
  const cohortValue = releaseIds.join(',')
  const setResult = run('npx', ['supabase', 'secrets', 'set', 'LEGAL_DOCUMENT_PILOT_ENABLED=true', `LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS=${cohortValue}`, '--project-ref', targetProjectRef, '--yes'])
  if (setResult.status !== 0) throw new Error(setResult.stderr || 'Supabase pilot activation failed.')
  const secretRows = listSecrets(targetProjectRef)
  if (!secretsMatch(secretRows, 'true', cohortValue)) {
    run('npx', ['supabase', 'secrets', 'set', 'LEGAL_DOCUMENT_PILOT_ENABLED=false', 'LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS=__none__', '--project-ref', targetProjectRef, '--yes'])
    throw new Error('Supabase pilot secrets did not verify; the runtime kill switch was restored.')
  }
  const activatedAt = new Date().toISOString()
  const nextConfig = {
    ...config,
    enabled: true,
    activation: {
      ...config.activation,
      status: 'active',
      targetProjectRef,
      activatedOrganisationIds: releaseIds,
      activatedBy,
      activatedAt,
      activationReference: reference,
      deactivatedBy: null,
      deactivatedAt: null,
      deactivationReason: null,
    },
  }
  const temporaryPath = `${CONFIG_PATH}.a3.tmp`
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(nextConfig, null, 2)}\n`, { flag: 'wx' })
    fs.renameSync(temporaryPath, CONFIG_PATH)
  } catch (error) {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath) } catch {}
    run('npx', ['supabase', 'secrets', 'set', 'LEGAL_DOCUMENT_PILOT_ENABLED=false', 'LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS=__none__', '--project-ref', targetProjectRef, '--yes'])
    throw new Error(`Activation config update failed and the runtime kill switch was restored: ${error.message}`)
  }
  console.log(JSON.stringify({ ...report, status: 'ACTIVE', activatedAt, mutatedData: true, secretDigestsVerified: true }, null, 2))
}
