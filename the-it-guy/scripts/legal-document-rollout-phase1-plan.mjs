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
import {
  assessLegalDocumentRolloutPhase1,
  createPendingLegalDocumentRolloutPhase1Receipt,
} from './legal-document-rollout-phase1-policy.mjs'

const CONFIG_DIR = path.join(APP_ROOT, 'config')

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function assertKnownOptions() {
  const allowed = new Set(['environment', 'staging-project-ref', 'staging-origin', 'prepared-by', 'reference'])
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

function phase0Context() {
  const packageLock = path.join(APP_ROOT, 'package-lock.json')
  const packageLockSha256 = fs.existsSync(packageLock) ? sha256Digest(fs.readFileSync(packageLock)) : ''
  const freeze = readJson('legal-document-rollout-phase0-freeze.json')
  const currentCommit = gitOutput(['rev-parse', 'HEAD'])
  const sourceContinuity = collectRolloutSourceContinuity({ repoRoot: REPO_ROOT, sourceCommit: freeze.source?.commitSha, currentCommit })
  return {
    freeze,
    sourceContinuity,
    phase1History: collectLegalDocumentRolloutPhase1History({ repoRoot: REPO_ROOT, sourceContinuity }),
    report: assessLegalDocumentRolloutPhase0Freeze({
      freeze,
      pilot: readJson('legal-document-pilot.json'),
      scale: readJson('legal-document-scale.json'),
      reviewManifest: readJson('legal-document-review-manifest.json'),
      authorityStates: authorityStates(),
      currentCommit,
      sourceContinuity,
      currentPackageLockDigest: packageLockSha256,
      worktreeClean: gitOutput(['status', '--porcelain=v1', '--untracked-files=all']) === '',
      creationPaused: String(process.env.MVP_PILOT_CREATION_PAUSED || 'true').trim().toLowerCase() !== 'false',
    }),
  }
}

function run() {
  assertKnownOptions()
  const context = phase0Context()
  const artifacts = collectLegalDocumentRolloutPhase1Artifacts()
  const receipt = createPendingLegalDocumentRolloutPhase1Receipt({
    phase0Freeze: context.freeze,
    artifacts,
    stagingProjectRef: option('staging-project-ref'),
    stagingOrigin: option('staging-origin'),
    preparedBy: option('prepared-by'),
    changeReference: option('reference'),
  })
  const report = assessLegalDocumentRolloutPhase1({
    receipt,
    phase0Freeze: context.freeze,
    phase0Report: context.report,
    expectedArtifacts: artifacts,
    phase1History: context.phase1History,
  })
  const environment = option('environment')
  const environmentError = environment === 'staging' ? null : 'Phase 1 planning requires --environment=staging.'
  console.log(JSON.stringify({
    ...report,
    action: 'emit_staging_plan',
    environmentError,
    proposedReceipt: receipt,
    releaseSequence: [
      'Resolve every Phase 0 HOLD blocker and commit the exact release source.',
      'Classify each 202607220002–202607220012 migration plus 202607230004 in docs/supabase-phase-5-application-manifest.json; do not use db push, reset, or a broad repair.',
      'Deploy the exact Edge Function unit and shared runtime before recording migration 202607220006; obtain explicit JWT/configuration review for generate-final-signed-otp and dispatch-final-signed-document.',
      'Use only the pinned, direct-host one-migration staging runner with a tested recovery artifact, then attach chained per-migration catalog, behavior, and no-residue evidence.',
      'Build with npm run build:guarded, bind Vercel deployment metadata to the frozen commit, and attest the generated preview releaseId, assets, and Supabase origin.',
      'Run Phase 4/5 write-capable smoke controls only later, with their own explicit fixture authority; keep the pilot disabled throughout this phase.',
    ],
    instructions: report.status === 'STAGING_PLANNED' && !environmentError
      ? 'Review the proposed receipt and save it in a clean, linear receipt-only descendant commit after the Phase 0 freeze receipt. This command did not deploy anything.'
      : 'No staging receipt may be recorded as ready until every HOLD blocker is resolved. This command did not deploy anything.',
  }, null, 2))
  if (environmentError || report.status === 'HOLD') process.exitCode = 1
}

try {
  run()
} catch (error) {
  console.error(`Phase 1 staging plan blocked: ${error.message}`)
  process.exitCode = 1
}
