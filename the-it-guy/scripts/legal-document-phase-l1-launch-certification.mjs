import { spawnSync } from 'node:child_process'
import { assessLegalDocumentLaunchCertification } from '../src/core/documents/legalDocumentLaunchCertification.js'

function runJson(script, timeout = 600_000) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 20 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return { status: 'UNAVAILABLE', blockers: [{ code: 'L1_VERIFIER_UNAVAILABLE', detail: script, solution: `Restore ${script} and rerun L1.` }] } }
}

const domains = {
  activation: runJson('scripts/legal-document-phase-a3-verify.mjs'),
  approval: runJson('scripts/legal-document-phase-b3-verify.mjs'),
  rendering: runJson('scripts/legal-document-phase-c2-verify.mjs'),
  capacity: runJson('scripts/legal-document-phase-i3-backpressure.mjs'),
  lifecycle: runJson('scripts/legal-document-phase-k3-support-sla.mjs'),
}
const capacityEvidence = domains.capacity?.evidence || {}
const controlledTypes = new Set((capacityEvidence.waves || []).flatMap((wave) => (wave.packetResults || []).map((row) => row.packetType)))
const coverage = {
  otp: controlledTypes.has('otp') || (domains.lifecycle?.status === 'READY_FOR_L1' && Number(capacityEvidence.targetCount || 0) >= 2),
  mandate: controlledTypes.has('mandate') || (domains.lifecycle?.status === 'READY_FOR_L1' && Number(capacityEvidence.targetCount || 0) >= 2),
}
const assessment = assessLegalDocumentLaunchCertification({ domains, coverage })
console.log(JSON.stringify({
  phase: 'L1', status: assessment.ready ? 'READY_FOR_L2' : 'NO_GO', blockerCount: assessment.blockers.length, blockers: assessment.blockers, domains: assessment.domainResults, coverage,
  evidence: { activationProjectRef: domains.activation?.projectRef || null, approvedTemplateCount: Array.isArray(domains.approval?.templateIds) ? domains.approval.templateIds.length : 0, renderScenarioCount: Number(domains.rendering?.scenarioCount || 0), controlledTargetCount: Number(capacityEvidence.targetCount || 0), lifecycleSupportSummary: domains.lifecycle?.evidence?.summary || null },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!assessment.ready) process.exitCode = 1
