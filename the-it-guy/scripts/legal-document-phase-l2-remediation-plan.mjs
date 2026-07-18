import { spawnSync } from 'node:child_process'
import { buildLegalDocumentLaunchRemediationPlan } from '../src/core/documents/legalDocumentLaunchRemediationPlan.js'

const run = spawnSync(process.execPath, ['scripts/legal-document-phase-l1-launch-certification.mjs'], {
  cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 600_000, maxBuffer: 20 * 1024 * 1024,
})

let l1
try {
  l1 = JSON.parse(run.stdout)
} catch {
  l1 = { status: 'UNAVAILABLE', blockers: [{ domain: 'certification', code: 'L2_L1_CERTIFICATE_UNAVAILABLE', detail: run.stderr || null, solution: 'Restore the L1 verifier and rerun L2.' }] }
}

const plan = buildLegalDocumentLaunchRemediationPlan(l1)
console.log(JSON.stringify({
  phase: 'L2', ...plan,
  evidence: { l1Status: l1.status || 'UNAVAILABLE', l1CheckedAt: l1.checkedAt || null, l1MutatedData: l1.mutatedData, coverage: l1.coverage || { otp: false, mandate: false }, activationProjectRef: l1.evidence?.activationProjectRef || null, domainResults: l1.domains || [] },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!plan.planComplete) process.exitCode = 1
