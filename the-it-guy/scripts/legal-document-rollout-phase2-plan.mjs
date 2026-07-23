import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  APP_ROOT,
  REPO_ROOT,
  collectLegalDocumentRolloutPhase1Artifacts,
  sha256Digest,
} from './legal-document-rollout-phase1-artifacts.mjs'
import {
  ROLLOUT_PHASE0_AUTHORITY_STATES,
  assessLegalDocumentRolloutPhase0Freeze,
} from './legal-document-rollout-phase0-policy.mjs'
import { collectRolloutSourceContinuity } from './legal-document-rollout-source-continuity.mjs'
import { collectLegalDocumentRolloutPhase1History } from './legal-document-rollout-phase1-history.mjs'
import { assessLegalDocumentRolloutPhase1 } from './legal-document-rollout-phase1-policy.mjs'
import {
  assessLegalDocumentRolloutPhase2,
  createPendingLegalDocumentRolloutPhase2Receipt,
} from './legal-document-rollout-phase2-policy.mjs'

const CONFIG_DIR = path.join(APP_ROOT, 'config')

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function assertKnownOptions() {
  const allowed = new Set(['environment', 'prepared-by', 'reference', 'fixture-namespace', 'fixture-write-limit', 'test-mailbox-digest'])
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith('--')) throw new Error(`Unknown argument: ${value}`)
    const name = value.slice(2).split('=')[0]
    if (!allowed.has(name)) throw new Error(`Unknown argument: ${value}`)
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, file), 'utf8'))
}

function gitOutput(args) {
  const result = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '').trim() : ''
}

function authorityStates() {
  return Object.fromEntries(Object.keys(ROLLOUT_PHASE0_AUTHORITY_STATES).map((file) => [file, String(readJson(file).status || '').trim()]))
}

function context() {
  const packageLock = path.join(APP_ROOT, 'package-lock.json')
  const currentCommit = gitOutput(['rev-parse', 'HEAD'])
  const freeze = readJson('legal-document-rollout-phase0-freeze.json')
  const sourceContinuity = collectRolloutSourceContinuity({ repoRoot: REPO_ROOT, sourceCommit: freeze.source?.commitSha, currentCommit })
  const phase0Report = assessLegalDocumentRolloutPhase0Freeze({
    freeze,
    pilot: readJson('legal-document-pilot.json'),
    scale: readJson('legal-document-scale.json'),
    reviewManifest: readJson('legal-document-review-manifest.json'),
    authorityStates: authorityStates(),
    currentCommit,
    sourceContinuity,
    currentPackageLockDigest: fs.existsSync(packageLock) ? sha256Digest(fs.readFileSync(packageLock)) : '',
    worktreeClean: gitOutput(['status', '--porcelain=v1', '--untracked-files=all']) === '',
    creationPaused: String(process.env.MVP_PILOT_CREATION_PAUSED || 'true').trim().toLowerCase() !== 'false',
  })
  const phase1Receipt = readJson('legal-document-rollout-phase1-staging.json')
  const phase1Report = assessLegalDocumentRolloutPhase1({
    receipt: phase1Receipt,
    phase0Freeze: freeze,
    phase0Report,
    expectedArtifacts: collectLegalDocumentRolloutPhase1Artifacts(),
    phase1History: collectLegalDocumentRolloutPhase1History({ repoRoot: REPO_ROOT, sourceContinuity }),
  })
  return { freeze, phase0Report, phase1Receipt, phase1Report }
}

function run() {
  assertKnownOptions()
  const environment = option('environment')
  const fixtureWriteLimitOption = option('fixture-write-limit')
  const parsedWriteLimit = fixtureWriteLimitOption ? Number(fixtureWriteLimitOption) : 4
  const release = context()
  const receipt = createPendingLegalDocumentRolloutPhase2Receipt({
    phase1Receipt: release.phase1Receipt,
    preparedBy: option('prepared-by'),
    changeReference: option('reference'),
    fixtureNamespace: option('fixture-namespace'),
    fixtureWriteLimit: Number.isInteger(parsedWriteLimit) ? parsedWriteLimit : NaN,
    testMailboxDigest: option('test-mailbox-digest'),
  })
  const report = assessLegalDocumentRolloutPhase2({
    receipt,
    phase0Freeze: release.freeze,
    phase0Report: release.phase0Report,
    phase1Receipt: release.phase1Receipt,
    phase1Report: release.phase1Report,
  })
  const environmentError = environment === 'staging' ? null : 'Phase 2 planning requires --environment=staging.'
  console.log(JSON.stringify({
    ...report,
    action: 'emit_staging_acceptance_plan',
    environmentError,
    proposedReceipt: receipt,
    requiredOperatorEvidence: [
      'Run four isolated controlled fixtures: individual seller-onboarding mandate, company seller-onboarding mandate, cash OTP, and bond OTP.',
      'Use only B1-approved canonical templates and the server-owned generate-mandate path; record redacted facts/template/content digests and D1/D2/D3 source-PDF evidence.',
      'Use a controlled test mailbox only. Record target roles and provider confirmation digests; never place email addresses, signing tokens, URLs, or raw logs in the evidence JSON.',
      'For each electronic fixture prove all required signers/fields complete, immutable F2 final-artifact linkage, and a downloaded PDF matching final storage evidence.',
      'Run alternate-template, cross-org/unauthorized actor, dispatch-target, retry/idempotency, and recovery checks without corrupting a packet.',
      'Run browser evidence against the exact Phase 1-attested generated Vercel preview/release—not Vite SSR or a custom production alias.',
      'Record physical_signature_capability as unsupported unless a server-attested upload, party-attestation, and immutable finalisation capability has actually been deployed. Unsupported physical signing is a HOLD, not a pass.',
    ],
    instructions: report.status === 'STAGING_ACCEPTANCE_PLANNED' && !environmentError
      ? 'Save the proposed receipt outside the release worktree as the controlled acceptance plan. Do not write config/legal-document-rollout-phase2-staging-acceptance.json yet. After the separately authorised staging procedure, use the finalizer to create the one permitted Phase 2 receipt commit.'
      : 'No Phase 2 acceptance work may be claimed as planned until every HOLD blocker is resolved. This command did not contact staging or create any fixture.',
  }, null, 2))
  if (environmentError || report.status === 'HOLD') process.exitCode = 1
}

try {
  run()
} catch (error) {
  console.error(`Phase 2 staging acceptance plan blocked: ${error.message}`)
  process.exitCode = 1
}
