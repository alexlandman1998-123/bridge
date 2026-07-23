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
import { collectLegalDocumentRolloutPhase2History } from './legal-document-rollout-phase2-history.mjs'
import { assessLegalDocumentRolloutPhase1 } from './legal-document-rollout-phase1-policy.mjs'
import { assessLegalDocumentRolloutPhase2 } from './legal-document-rollout-phase2-policy.mjs'

const CONFIG_DIR = path.join(APP_ROOT, 'config')

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

/**
 * Collects the local-only parent reports needed by both Phase 3 plan and
 * verify commands. It never invokes a provider client, starts a browser, or
 * mutates a repository or remote system.
 */
export function collectLegalDocumentRolloutPhase3Context() {
  const packageLock = path.join(APP_ROOT, 'package-lock.json')
  const freeze = readJson('legal-document-rollout-phase0-freeze.json')
  const currentCommit = gitOutput(['rev-parse', 'HEAD'])
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
  const phase2Receipt = readJson('legal-document-rollout-phase2-staging-acceptance.json')
  const phase2Report = assessLegalDocumentRolloutPhase2({
    receipt: phase2Receipt,
    phase0Freeze: freeze,
    phase0Report,
    phase1Receipt,
    phase1Report,
  })
  return {
    freeze,
    sourceContinuity,
    phase0Report,
    phase1Receipt,
    phase1Report,
    phase2Receipt,
    phase2Report,
    phase2History: collectLegalDocumentRolloutPhase2History({ repoRoot: REPO_ROOT, sourceContinuity }),
  }
}
