import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import {
  ROLLOUT_PHASE0_AUTHORITY_STATES,
  assessLegalDocumentRolloutPhase0Freeze,
  authorityStateDigest,
  freezeManifestDigest,
  sha256,
} from './legal-document-rollout-phase0-policy.mjs'
import { collectRolloutSourceContinuity } from './legal-document-rollout-source-continuity.mjs'

const CONFIG_DIR = 'config'

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

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

const environment = arg('environment')
const productionProjectRef = arg('project-ref')
const frozenBy = arg('frozen-by')
const changeReference = arg('reference')
const releaseOwner = arg('release-owner')
const legalOwner = arg('legal-owner')
const operationsOwner = arg('operations-owner')
const sourceCommitSha = gitOutput(['rev-parse', 'HEAD'])
const worktreeClean = gitOutput(['status', '--porcelain=v1', '--untracked-files=all']) === ''
const packageLockPath = 'package-lock.json'
const packageLockSha256 = fs.existsSync(packageLockPath) ? `sha256:${sha256(fs.readFileSync(packageLockPath))}` : ''
const pilot = readJson('legal-document-pilot.json')
const scale = readJson('legal-document-scale.json')
const reviewManifest = readJson('legal-document-review-manifest.json')
const states = authorityStates()

const freeze = {
  version: 1,
  phase: 'ROLL_OUT_0',
  contract: 'legal-document-rollout-freeze-v1',
  status: 'frozen',
  environment,
  productionProjectRef,
  source: {
    commitSha: sourceCommitSha,
    packageLockSha256,
  },
  allowedPilotOrganisationIds: [],
  runtime: {
    pilotEnabled: false,
    organisationIdsSentinel: '__none__',
  },
  creation: { paused: true },
  templateReview: {
    boundB1ManifestDigest: reviewManifest.manifestDigest || '',
    evidenceProjectRef: reviewManifest.projectRef || '',
  },
  releaseAuthority: {
    states: ROLLOUT_PHASE0_AUTHORITY_STATES,
    stateDigest: authorityStateDigest(ROLLOUT_PHASE0_AUTHORITY_STATES),
  },
  exceptions: {
    allowExistingSignerCompletion: true,
    allowFinalArtifactDownload: true,
  },
  frozenAt: new Date().toISOString(),
  frozenBy,
  releaseOwner,
  legalOwner,
  operationsOwner,
  changeReference,
  manifestDigest: '',
}
freeze.manifestDigest = freezeManifestDigest(freeze)

const report = assessLegalDocumentRolloutPhase0Freeze({
  freeze,
  pilot,
  scale,
  reviewManifest,
  authorityStates: states,
  currentCommit: sourceCommitSha,
  sourceContinuity: collectRolloutSourceContinuity({ repoRoot: process.cwd(), sourceCommit: sourceCommitSha, currentCommit: sourceCommitSha }),
  currentPackageLockDigest: packageLockSha256,
  worktreeClean,
  creationPaused: String(process.env.MVP_PILOT_CREATION_PAUSED || 'true').trim().toLowerCase() !== 'false',
})

console.log(JSON.stringify({
  ...report,
  action: 'emit_freeze_manifest',
  proposedFreeze: freeze,
  instructions: report.status === 'FROZEN'
    ? 'Review the proposed manifest, then make it the first clean receipt-only descendant commit of the frozen source; that commit may change only config/legal-document-rollout-phase0-freeze.json. Run the verifier from that commit.'
    : 'No freeze manifest may be recorded until every HOLD blocker is resolved.',
}, null, 2))

if (report.status !== 'FROZEN') process.exitCode = 1
