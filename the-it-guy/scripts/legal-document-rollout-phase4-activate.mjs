import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ROLLOUT_PHASE4_MAX_ACTIVATION_WINDOW_MS,
  ROLLOUT_PHASE4_RUNTIME_GUARD_CONTRACT,
  assessLegalDocumentRolloutPhase4,
  rolloutPhase4ManifestDigest,
} from './legal-document-rollout-phase4-policy.mjs'
import { collectLegalDocumentRolloutPhase4Context } from './legal-document-rollout-phase4-context.mjs'
import { stableJson } from './legal-document-rollout-phase1-artifacts.mjs'

const APPLY_APPROVAL_ENV = 'LEGAL_DOCUMENT_ROLLOUT_PHASE4_ACTIVATION_APPROVED'
const DARK_LAUNCH_VALUES = Object.freeze({
  LEGAL_DOCUMENT_PILOT_ENABLED: 'false',
  LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS: '__none__',
  LEGAL_DOCUMENT_PILOT_PLAN_DIGEST: '__none__',
})
const DIGEST = /^sha256:[0-9a-f]{64}$/

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`
}

function valueDigest(value) {
  return digest(value)
}

function fail(message) {
  throw new Error(`Phase 4 production pilot activator blocked: ${message}`)
}

function parseArgs(argv = process.argv.slice(2)) {
  const allowed = new Set([
    'plan', 'apply', 'confirm-project-ref', 'confirm-organisation-id', 'confirm-activation-plan-digest',
    'confirm-phase3-receipt-commit', 'activated-by', 'reference', 'route-coverage-evidence-digest',
  ])
  const values = {}
  let apply = false
  for (const arg of argv) {
    if (!arg.startsWith('--')) fail(`Unknown argument: ${arg}`)
    const [name, ...rest] = arg.slice(2).split('=')
    if (!allowed.has(name)) fail(`Unknown argument: ${arg}`)
    if (name === 'apply') {
      if (rest.length || apply) fail('--apply may appear once without a value.')
      apply = true
      continue
    }
    if (!rest.length || rest.join('=') === '' || Object.hasOwn(values, name)) fail(`--${name}=<value> must appear exactly once.`)
    values[name] = rest.join('=')
  }
  return { apply, ...values }
}

function readPlan(planPath) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), planPath), 'utf8'))
  } catch (error) {
    fail(`Could not read the sealed pending plan: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  })
}

function secretRows(projectRef) {
  const result = run('npx', ['supabase', 'secrets', 'list', '--project-ref', projectRef, '--output', 'json'])
  if (result.status !== 0) fail(result.stderr || 'Unable to read the target project secret fingerprints.')
  try {
    const rows = JSON.parse(result.stdout)
    if (!Array.isArray(rows)) fail('The target project did not return a JSON secret list.')
    return rows
  } catch (error) {
    fail(`Could not parse the target project secret fingerprints: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
}

function normalizedRemoteFingerprint(value) {
  const candidate = text(value).toLowerCase()
  if (/^[a-f0-9]{64}$/.test(candidate)) return `sha256:${candidate}`
  return DIGEST.test(candidate) ? candidate : ''
}

function observedValueDigests(rows) {
  const byName = new Map((Array.isArray(rows) ? rows : []).map((row) => [text(row?.name), normalizedRemoteFingerprint(row?.value)]))
  return {
    LEGAL_DOCUMENT_PILOT_ENABLED: byName.get('LEGAL_DOCUMENT_PILOT_ENABLED') || null,
    LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS: byName.get('LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS') || null,
    LEGAL_DOCUMENT_PILOT_PLAN_DIGEST: byName.get('LEGAL_DOCUMENT_PILOT_PLAN_DIGEST') || null,
  }
}

function expectedValueDigests(values) {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, valueDigest(value)]))
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right)
}

function setRuntimeValues(projectRef, values) {
  const assignments = Object.entries(values).map(([name, value]) => `${name}=${value}`)
  const result = run('npx', ['supabase', 'secrets', 'set', ...assignments, '--project-ref', projectRef, '--yes'])
  if (result.status !== 0) throw new Error(result.stderr || 'Supabase pilot runtime configuration update failed.')
}

function rollbackToDarkLaunch(projectRef) {
  try {
    setRuntimeValues(projectRef, DARK_LAUNCH_VALUES)
    const observed = observedValueDigests(secretRows(projectRef))
    const expected = expectedValueDigests(DARK_LAUNCH_VALUES)
    return {
      attempted: true,
      verified: sameJson(observed, expected),
      observedValueDigests: observed,
      expectedValueDigests: expected,
    }
  } catch (error) {
    return {
      attempted: true,
      verified: false,
      error: error instanceof Error ? error.message : 'Dark-launch restore failed.',
    }
  }
}

function activationValues(plan) {
  const organisationIds = Array.isArray(plan.cohort?.organisationIds) ? plan.cohort.organisationIds : []
  return {
    LEGAL_DOCUMENT_PILOT_ENABLED: 'true',
    LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS: organisationIds.join(','),
    LEGAL_DOCUMENT_PILOT_PLAN_DIGEST: text(plan.source?.activationPlanDigest),
  }
}

function activationEvidence({ plan, activatedBy, reference, routeCoverageEvidenceDigest, observed }) {
  const expected = expectedValueDigests(activationValues(plan))
  const configurationEvidenceDigest = digest(stableJson({
    targetProjectRef: plan.environment?.productionProjectRef,
    expectedValueDigests: expected,
    runtimeGuardContract: ROLLOUT_PHASE4_RUNTIME_GUARD_CONTRACT,
  }))
  const verificationEvidenceDigest = digest(stableJson({
    targetProjectRef: plan.environment?.productionProjectRef,
    observedValueDigests: observed,
    expectedValueDigests: expected,
  }))
  const activatedAt = new Date().toISOString()
  const activation = {
    status: 'attested',
    productionProjectRef: plan.environment?.productionProjectRef || null,
    organisationIds: plan.cohort?.organisationIds || [],
    cohortDigest: plan.cohort?.cohortDigest || null,
    pilotEnabled: true,
    activationPlanDigest: plan.source?.activationPlanDigest || null,
    runtimeGuardContract: ROLLOUT_PHASE4_RUNTIME_GUARD_CONTRACT,
    activatedAt,
    activatedBy,
    activationReference: reference,
    configurationEvidenceDigest,
    verificationEvidenceDigest,
    routeCoverageEvidenceDigest,
    evidenceDigest: null,
  }
  activation.evidenceDigest = digest(stableJson({ ...activation, evidenceDigest: null }))
  return activation
}

function assessPlan(plan, context) {
  return assessLegalDocumentRolloutPhase4({
    receipt: plan,
    phase0Freeze: context.freeze,
    phase0Report: context.phase0Report,
    phase1Receipt: context.phase1Receipt,
    phase1Report: context.phase1Report,
    phase2Receipt: context.phase2Receipt,
    phase2Report: context.phase2Report,
    phase3Receipt: context.phase3Receipt,
    phase3Report: context.phase3Report,
    phase3History: context.phase3History,
  })
}

function gateErrors({ args, plan, planReport }) {
  const errors = []
  const organisationId = Array.isArray(plan.cohort?.organisationIds) ? plan.cohort.organisationIds[0] : ''
  if (plan.status !== 'pending_activation' || plan.manifestDigest !== rolloutPhase4ManifestDigest(plan)) errors.push('The supplied plan is not an intact pending Phase 4 receipt.')
  if (planReport.status !== 'PILOT_ACTIVATION_PLANNED') errors.push('The supplied plan has unresolved Phase 0→3 lineage or readiness blockers.')
  if (args.apply && process.env[APPLY_APPROVAL_ENV] !== 'true') errors.push(`${APPLY_APPROVAL_ENV}=true is required with --apply.`)
  if (args.apply && args['confirm-project-ref'] !== plan.environment?.productionProjectRef) errors.push('The confirmed production project does not match the sealed plan.')
  if (args.apply && args['confirm-organisation-id'] !== organisationId) errors.push('The confirmed organisation does not match the sealed one-organisation cohort.')
  if (args.apply && args['confirm-activation-plan-digest'] !== plan.source?.activationPlanDigest) errors.push('The confirmed activation-plan digest does not match the sealed plan.')
  if (args.apply && args['confirm-phase3-receipt-commit'] !== plan.source?.phase3ReceiptCommitSha) errors.push('The confirmed committed Phase 3 receipt SHA does not match the sealed plan.')
  if (args.apply && !text(args['activated-by'])) errors.push('An accountable --activated-by value is required with --apply.')
  if (args.apply && !text(args.reference)) errors.push('A change --reference is required with --apply.')
  if (args.apply && !DIGEST.test(text(args['route-coverage-evidence-digest']))) errors.push('A redacted SHA-256 --route-coverage-evidence-digest is required with --apply.')
  if (args.apply) {
    const preparedAt = Date.parse(text(plan.evidence?.preparedAt))
    const age = Date.now() - preparedAt
    if (!Number.isFinite(preparedAt) || age < -5 * 60_000 || age > ROLLOUT_PHASE4_MAX_ACTIVATION_WINDOW_MS) {
      errors.push('The sealed plan is outside the 30-minute activation window; create a new pending Phase 4 plan.')
    }
  }
  return errors
}

function safeReport({ args, plan, planReport, blockers, status, activation = null, rollback = null, observed = null, preActivationObserved = null, remoteWriteAttempted = false }) {
  const targetValues = activationValues(plan)
  return {
    phase: 'ROLL_OUT_4',
    contract: 'legal-document-production-pilot-v1',
    action: 'activate_one_organisation_production_pilot',
    mode: args.apply ? 'apply' : 'dry-run',
    status,
    planManifestDigest: text(plan.manifestDigest) || null,
    activationPlanDigest: text(plan.source?.activationPlanDigest) || null,
    phase3ReceiptCommitSha: text(plan.source?.phase3ReceiptCommitSha) || null,
    productionProjectRef: text(plan.environment?.productionProjectRef) || null,
    organisationIds: plan.cohort?.organisationIds || [],
    cohortDigest: text(plan.cohort?.cohortDigest) || null,
    runtimeGuardContract: ROLLOUT_PHASE4_RUNTIME_GUARD_CONTRACT,
    plannedRuntimeValueDigests: expectedValueDigests(targetValues),
    expectedDarkLaunchRuntimeValueDigests: expectedValueDigests(DARK_LAUNCH_VALUES),
    preActivationRuntimeValueDigests: preActivationObserved,
    observedRuntimeValueDigests: observed,
    planStatus: planReport.status,
    blockers,
    activation,
    rollback,
    safety: {
      writesLocalPilotConfig: false,
      neverWritesLocalConfigPath: 'config/legal-document-pilot.json',
      rollbackTarget: 'false/__none__/__none__',
      remoteWriteRequiresApply: true,
    },
    // A failed CLI write can be partial. Treat any apply-path attempt as a
    // mutation for operational accounting until the dark-launch restore has
    // been independently verified.
    remoteWriteAttempted,
    mutatedData: remoteWriteAttempted,
  }
}

function main() {
  const args = parseArgs()
  if (!text(args.plan)) fail('--plan=<saved-pending-phase4-plan.json> is required.')
  const plan = readPlan(args.plan)
  const context = collectLegalDocumentRolloutPhase4Context()
  const planReport = assessPlan(plan, context)
  const blockers = gateErrors({ args, plan, planReport })
  if (!args.apply || blockers.length) {
    console.log(JSON.stringify(safeReport({
      args,
      plan,
      planReport,
      blockers,
      status: blockers.length ? 'BLOCKED' : 'DRY_RUN_READY',
    }), null, 2))
    if (blockers.length) process.exitCode = 1
    return
  }

  const values = activationValues(plan)
  let preActivationObserved = null
  try {
    preActivationObserved = observedValueDigests(secretRows(plan.environment.productionProjectRef))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to inspect the pre-activation production runtime.'
    console.log(JSON.stringify(safeReport({
      args,
      plan,
      planReport,
      blockers: [{ code: 'P4_PRE_ACTIVATION_RUNTIME_READ_FAILED', detail: message }],
      status: 'BLOCKED_PRE_ACTIVATION_RUNTIME_UNVERIFIED',
    }), null, 2))
    process.exitCode = 1
    return
  }
  if (!sameJson(preActivationObserved, expectedValueDigests(DARK_LAUNCH_VALUES))) {
    console.log(JSON.stringify(safeReport({
      args,
      plan,
      planReport,
      blockers: [{ code: 'P4_PRE_ACTIVATION_DARK_LAUNCH_MISMATCH', detail: 'The exact production pilot secret fingerprints are not the sealed false/__none__/__none__ dark-launch state.' }],
      status: 'BLOCKED_PRE_ACTIVATION_DARK_LAUNCH_MISMATCH',
      preActivationObserved,
    }), null, 2))
    process.exitCode = 1
    return
  }
  let activationAttempted = false
  try {
    activationAttempted = true
    setRuntimeValues(plan.environment.productionProjectRef, values)
    const observed = observedValueDigests(secretRows(plan.environment.productionProjectRef))
    const expected = expectedValueDigests(values)
    if (!sameJson(observed, expected)) throw new Error('Post-write remote secret fingerprints did not match the sealed activation plan.')
    const activation = activationEvidence({
      plan,
      activatedBy: args['activated-by'],
      reference: args.reference,
      routeCoverageEvidenceDigest: args['route-coverage-evidence-digest'],
      observed,
    })
    console.log(JSON.stringify(safeReport({
      args,
      plan,
      planReport,
      blockers: [],
      status: 'ACTIVATED_AND_VERIFIED',
      activation,
      observed,
      preActivationObserved,
      remoteWriteAttempted: true,
    }), null, 2))
  } catch (error) {
    const rollback = activationAttempted ? rollbackToDarkLaunch(plan.environment?.productionProjectRef) : null
    const message = error instanceof Error ? error.message : 'Remote pilot activation failed.'
    console.log(JSON.stringify(safeReport({
      args,
      plan,
      planReport,
      blockers: [{ code: 'P4_REMOTE_ACTIVATION_OR_VERIFICATION_FAILED', detail: message }],
      status: rollback?.verified ? 'ROLLED_BACK_AFTER_VERIFICATION_FAILURE' : 'ACTIVATION_FAILURE_REQUIRES_MANUAL_DARK_LAUNCH_RESTORE',
      rollback,
      preActivationObserved,
      remoteWriteAttempted: activationAttempted,
    }), null, 2))
    process.exitCode = 1
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 4 production pilot activator blocked.')
    process.exitCode = 1
  }
}
