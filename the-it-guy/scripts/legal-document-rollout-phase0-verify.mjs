import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import {
  ROLLOUT_PHASE0_AUTHORITY_STATES,
  assessLegalDocumentRolloutPhase0Freeze,
  sha256,
} from './legal-document-rollout-phase0-policy.mjs'
import { collectRolloutSourceContinuity } from './legal-document-rollout-source-continuity.mjs'

const CONFIG_DIR = 'config'

function readJson(file) {
  return JSON.parse(fs.readFileSync(`${CONFIG_DIR}/${file}`, 'utf8'))
}

function runGit(args) {
  return spawnSync('git', args, { cwd: process.cwd(), encoding: 'utf8' })
}

function gitOutput(args) {
  const result = runGit(args)
  return result.status === 0 ? String(result.stdout || '').trim() : ''
}

function authorityStates() {
  return Object.fromEntries(Object.keys(ROLLOUT_PHASE0_AUTHORITY_STATES).map((file) => [file, String(readJson(file).status || '').trim()]))
}

const packageLockPath = 'package-lock.json'
const packageLockSha256 = fs.existsSync(packageLockPath) ? `sha256:${sha256(fs.readFileSync(packageLockPath))}` : ''
const freeze = readJson('legal-document-rollout-phase0-freeze.json')
const currentCommit = gitOutput(['rev-parse', 'HEAD'])
const report = assessLegalDocumentRolloutPhase0Freeze({
  freeze,
  pilot: readJson('legal-document-pilot.json'),
  scale: readJson('legal-document-scale.json'),
  reviewManifest: readJson('legal-document-review-manifest.json'),
  authorityStates: authorityStates(),
  currentCommit,
  sourceContinuity: collectRolloutSourceContinuity({ repoRoot: process.cwd(), sourceCommit: freeze.source?.commitSha, currentCommit }),
  currentPackageLockDigest: packageLockSha256,
  worktreeClean: gitOutput(['status', '--porcelain=v1', '--untracked-files=all']) === '',
  creationPaused: String(process.env.MVP_PILOT_CREATION_PAUSED || 'true').trim().toLowerCase() !== 'false',
})

console.log(JSON.stringify(report, null, 2))
if (report.status !== 'FROZEN') process.exitCode = 1
