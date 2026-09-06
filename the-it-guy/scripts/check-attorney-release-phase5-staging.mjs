import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAttorneyReleaseDecision } from '../src/services/attorneyReleaseDecision.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: projectRoot, env: process.env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  return { passed: result.status === 0, stdout: result.stdout || '', stderr: result.stderr || '' }
}

function parseJsonOutput(output) {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try { return JSON.parse(output.slice(start, end + 1)) } catch { return null }
}

function readEvidence(envKey) {
  const configuredPath = String(process.env[envKey] || '').trim()
  if (!configuredPath) return null
  const absolutePath = resolve(projectRoot, configuredPath)
  if (!existsSync(absolutePath)) return null
  try { return JSON.parse(readFileSync(absolutePath, 'utf8')) } catch { return null }
}

const fingerprintFiles = [
  'src/constants/attorneyReleaseReadinessPhase0.js',
  'src/services/attorneyReleasePropagation.js',
  'src/services/attorneyReleaseDecision.js',
  'src/services/attorneyWorkflow/attorneyWorkflowLaneService.js',
  'src/services/attorneyWorkflow/transferWorkspaceViewModel.js',
  'src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx',
  'src/components/attorney/workflow/LegalTaskWorkbench.jsx',
  'src/components/ui/Modal.jsx',
]
const fingerprint = createHash('sha256')
for (const relativePath of fingerprintFiles) fingerprint.update(relativePath).update('\0').update(readFileSync(resolve(projectRoot, relativePath))).update('\0')
const sourceFingerprint = fingerprint.digest('hex')

const localGatesSkipped = args.has('--skip-local-gates')
const codeGate = localGatesSkipped ? { passed: false, skipped: true } : run('npm', ['run', 'test:attorney-release-phase4'])
const buildGate = localGatesSkipped ? { passed: false, skipped: true } : run('npm', ['run', 'build'])
const actorCheck = run(process.execPath, ['scripts/check-attorney-release-phase0-staging.mjs'])
const propagationCheck = run(process.execPath, ['scripts/check-attorney-release-phase3-staging.mjs'])
const actorReport = parseJsonOutput(actorCheck.stdout)
const propagationReport = parseJsonOutput(propagationCheck.stdout)
const browserEvidence = readEvidence('ATTORNEY_RELEASE_BROWSER_EVIDENCE_FILE')
const approval = readEvidence('ATTORNEY_RELEASE_APPROVAL_FILE')

const decision = buildAttorneyReleaseDecision({
  sourceFingerprint,
  codeGatePassed: codeGate.passed,
  buildPassed: buildGate.passed,
  actors: actorReport?.actors || [],
  fixture: actorReport?.fixture || propagationReport?.fixture,
  propagation: propagationReport?.health,
  browserEvidence,
  approval,
})

console.log(JSON.stringify({
  phase: 5,
  ...decision,
  evidence: {
    localGatesSkipped,
    actorPreflightPassed: actorCheck.passed,
    propagationPreflightPassed: propagationCheck.passed,
    browserEvidenceLoaded: Boolean(browserEvidence),
    approvalLoaded: Boolean(approval),
    fingerprintFiles,
  },
}, null, 2))

if (decision.status !== 'GO') process.exitCode = 1
