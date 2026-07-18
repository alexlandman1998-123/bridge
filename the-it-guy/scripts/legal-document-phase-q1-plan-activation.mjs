import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { buildLegalDocumentExpansionActivationPlan } from '../src/core/documents/legalDocumentExpansionActivationPlan.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const STATE_PATH = 'config/legal-document-expansion-activation-plan.json'
const WRITE_FLAG = 'LEGAL_DOCUMENT_PHASE_Q1_WRITE'
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const ids = (value) => [...new Set(String(value || '').split(',').map((row) => row.trim()).filter(Boolean))].sort()
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-p3-expanded-cohort-certification.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 30 * 1024 * 1024 })
let p3
try { p3 = JSON.parse(run.stdout) } catch { p3 = { status: 'UNAVAILABLE', ready: false, blockers: [{ code: 'Q1_P3_UNAVAILABLE', solution: 'Restore the P3 verifier before planning activation.' }] } }
const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
const certification = p3.certification
const apply = process.argv.includes('--apply')
const blockers = [...(p3.blockers || [])]
if (p3.status !== 'READY_FOR_FRESH_AUTHORITY' || p3.ready !== true || !certification) blockers.push({ code: 'Q1_P3_NOT_READY', solution: 'Resolve P3 before planning expanded-cohort activation.' })
if (!arg('planned-by')) blockers.push({ code: 'Q1_PLANNER_MISSING', solution: 'Supply --planned-by with the accountable activation planner.' })
if (!arg('reference')) blockers.push({ code: 'Q1_REFERENCE_MISSING', solution: 'Supply --reference with the activation/change record.' })
if (arg('confirm-certification-digest') !== certification?.certificationDigest) blockers.push({ code: 'Q1_CERTIFICATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact fresh P3 certification digest.' })
if (arg('confirm-environment') !== certification?.releaseTarget?.environment) blockers.push({ code: 'Q1_ENVIRONMENT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact certified environment.' })
if (arg('confirm-project-ref') !== certification?.releaseTarget?.projectRef) blockers.push({ code: 'Q1_PROJECT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact certified project ref.' })
if (ids(arg('confirm-current-organisation-ids')).join(',') !== ids((certification?.currentOrganisationIds || []).join(',')).join(',')) blockers.push({ code: 'Q1_CURRENT_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact current cohort.' })
if (ids(arg('confirm-proposed-organisation-ids')).join(',') !== ids((certification?.proposedOrganisationIds || []).join(',')).join(',')) blockers.push({ code: 'Q1_PROPOSED_COHORT_CONFIRMATION_MISMATCH', solution: 'Confirm the exact proposed cohort.' })
if (arg('confirm-added-organisation-id') !== certification?.addedOrganisationId) blockers.push({ code: 'Q1_ADDED_ORGANISATION_CONFIRMATION_MISMATCH', solution: 'Confirm the exact added organisation.' })
if (apply && process.env[WRITE_FLAG] !== 'true') blockers.push({ code: 'Q1_WRITE_FLAG_MISSING', solution: `${WRITE_FLAG}=true is required for activation-plan writes.` })
if ([state.plan, ...(state.history || [])].some((row) => row?.sourceCertificationDigest === certification?.certificationDigest)) blockers.push({ code: 'Q1_CERTIFICATION_ALREADY_PLANNED', solution: 'Use the existing activation plan; one certificate cannot create multiple plans.' })
const unique = [...new Map(blockers.map((row) => [`${row.code}:${row.detail || ''}`, row])).values()]
const payload = buildLegalDocumentExpansionActivationPlan({ certification: certification || {}, plannedBy: arg('planned-by'), planningReference: arg('reference'), evidenceAgeLimitMinutes: p3.evidenceAgeLimitMinutes || 15 })
const plan = { ...payload, planDigest: digest(payload) }
const report = { phase: 'Q1', action: 'plan_expansion_activation', mode: apply ? 'apply' : 'dry-run', status: unique.length ? 'BLOCKED' : apply ? 'PLANNED' : 'DRY_RUN_READY', blockerCount: unique.length, blockers: unique, plan: unique.length ? null : plan, effectiveAllowlistChanged: false, runtimeSecretsChanged: false, mutatedData: false }
if (!apply || unique.length) {
  console.log(JSON.stringify(report, null, 2))
  if (unique.length) process.exitCode = 1
} else {
  const next = { version: 1, status: 'planned', plan, history: [...(state.history || []), ...(state.plan ? [state.plan] : [])] }
  const temporaryPath = `${STATE_PATH}.q1.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
  fs.renameSync(temporaryPath, STATE_PATH)
  console.log(JSON.stringify({ ...report, mutatedData: true }, null, 2))
}
