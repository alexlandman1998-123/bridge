import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentExpandedCohortActivation } from '../src/core/documents/legalDocumentExpandedCohortActivation.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const digest = (value) => `sha256:${hash(JSON.stringify(canonicalLegalDocumentReleaseValue(value)))}`
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
let activationState
let planState
let approvalState
let pendingState
try { activationState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8')) } catch { activationState = { status: 'unavailable', activation: null } }
try { planState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation-plan.json', 'utf8')) } catch { planState = { status: 'unavailable', plan: null } }
try { approvalState = JSON.parse(fs.readFileSync('config/legal-document-expansion-approval.json', 'utf8')) } catch { approvalState = { status: 'unavailable', approval: null } }
try { pendingState = JSON.parse(fs.readFileSync('config/legal-document-pending-expansion.json', 'utf8')) } catch { pendingState = { status: 'unavailable', pending: null } }
let runtimeSecretsVerified = false
let runtimeError = null
const projectRef = activationState.activation?.activationTarget?.projectRef || ''
const cohortValue = [...new Set(activationState.activation?.activatedOrganisationIds || [])].sort().join(',')
if (projectRef && cohortValue) {
  const result = spawnSync('npx', ['supabase', 'secrets', 'list', '--project-ref', projectRef, '--output', 'json'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 })
  if (result.status === 0) {
    const secrets = new Map(JSON.parse(result.stdout).map((row) => [row.name, row.value]))
    runtimeSecretsVerified = secrets.get('LEGAL_DOCUMENT_PILOT_ENABLED') === hash('true') && secrets.get('LEGAL_DOCUMENT_PILOT_ORGANISATION_IDS') === hash(cohortValue)
  } else runtimeError = result.stderr || 'Runtime secret verification failed.'
}
const assessment = assessLegalDocumentExpandedCohortActivation({ activation: activationState.activation, plan: planState.plan, approval: approvalState.approval, pending: pendingState.pending, pilot, runtimeSecretsVerified, digest })
console.log(JSON.stringify({ phase: 'Q2', status: assessment.ready ? 'READY_FOR_Q3' : 'NO_GO', ready: assessment.ready, blockerCount: assessment.blockers.length, blockers: assessment.blockers, evidence: { activationState: activationState.status || 'UNAVAILABLE', planState: planState.status || 'UNAVAILABLE', approvalState: approvalState.status || 'UNAVAILABLE', projectRef: projectRef || null, organisationIds: activationState.activation?.activatedOrganisationIds || [], runtimeSecretsVerified, runtimeError }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
