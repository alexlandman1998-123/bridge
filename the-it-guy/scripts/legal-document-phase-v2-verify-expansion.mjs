import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentNextExpandedCohortActivation } from '../src/core/documents/legalDocumentNextExpandedCohortActivation.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const digest = (value) => `sha256:${hash(JSON.stringify(canonicalLegalDocumentReleaseValue(value)))}`
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
const pilot = read('config/legal-document-pilot.json', {})
const activationState = read('config/legal-document-next-expansion-activation.json', { status: 'unavailable', activation: null })
const planState = read('config/legal-document-next-expansion-activation-plan.json', { status: 'unavailable', plan: null })
const approvalState = read('config/legal-document-next-expansion-approval.json', { status: 'unavailable', approval: null })
const pendingState = read('config/legal-document-next-pending-expansion.json', { status: 'unavailable', pending: null })
const continuationState = read('config/legal-document-expanded-cohort-continuation.json', { status: 'unavailable', record: null })
const previousActivationState = read('config/legal-document-expansion-activation.json', { status: 'unavailable', activation: null })
let runtimeSecretsVerified = false
let runtimeError = null
const projectRef = activationState.activation?.activationTarget?.projectRef || ''
const cohortValue = [...new Set(activationState.activation?.activatedOrganisationIds || [])].sort().join(',')
if (projectRef && cohortValue) {
  const result = spawnSync('npx', ['supabase', 'secrets', 'list', '--project-ref', projectRef, '--output', 'json'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
  if (result.status === 0) {
    try {
      const secrets = new Map(JSON.parse(result.stdout).map((row) => [row.name, row.value]))
      runtimeSecretsVerified = secrets.get('LEGAL_DOCUMENT_PILOT_ENABLED') === hash('true') && secrets.get('LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS') === hash(cohortValue)
    } catch (error) { runtimeError = `Runtime secret response was invalid: ${error.message}` }
  } else runtimeError = result.stderr || 'Runtime secret verification failed.'
}
const assessment = assessLegalDocumentNextExpandedCohortActivation({ activation: activationState.activation, plan: planState.plan, approval: approvalState.approval, pending: pendingState.pending, continuation: continuationState.record, previousActivation: previousActivationState.activation, pilot, runtimeSecretsVerified, digest })
console.log(JSON.stringify({
  phase: 'V2', status: assessment.ready ? 'READY_FOR_V3' : 'NO_GO', ready: assessment.ready,
  blockerCount: assessment.blockers.length, blockers: assessment.blockers,
  evidence: {
    activationState: activationState.status || 'UNAVAILABLE', planState: planState.status || 'UNAVAILABLE', approvalState: approvalState.status || 'UNAVAILABLE', pendingState: pendingState.status || 'UNAVAILABLE', continuationState: continuationState.status || 'UNAVAILABLE', previousActivationState: previousActivationState.status || 'UNAVAILABLE',
    projectRef: projectRef || null, organisationIds: activationState.activation?.activatedOrganisationIds || [], runtimeSecretsVerified, runtimeError,
  },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!assessment.ready) process.exitCode = 1
