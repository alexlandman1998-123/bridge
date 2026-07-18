import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentExpansionActivationPlan } from '../src/core/documents/legalDocumentExpansionActivationPlan.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-p3-expanded-cohort-certification.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 30 * 1024 * 1024 })
let p3
try { p3 = JSON.parse(run.stdout) } catch { p3 = { status: 'UNAVAILABLE', ready: false, certification: null } }
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
let state
let pendingState
try { state = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation-plan.json', 'utf8')) } catch { state = { status: 'unavailable', plan: null } }
try { pendingState = JSON.parse(fs.readFileSync('config/legal-document-pending-expansion.json', 'utf8')) } catch { pendingState = { status: 'unavailable', pending: null } }
const assessment = assessLegalDocumentExpansionActivationPlan({ plan: state.plan, currentP3: p3, pending: pendingState.pending, configuredOrganisationIds: pilot.organisationIds, digest })
console.log(JSON.stringify({ phase: 'Q1', status: assessment.ready ? 'READY_FOR_Q2' : 'NO_GO', ready: assessment.ready, blockerCount: assessment.blockers.length, blockers: assessment.blockers, evidence: { planState: state.status || 'UNAVAILABLE', p3Status: p3.status || 'UNAVAILABLE', pendingState: pendingState.status || 'UNAVAILABLE', currentOrganisationIds: pilot.organisationIds || [], activationTarget: state.plan?.activationTarget || null, expiresAt: state.plan?.expiresAt || null, effectiveAllowlistChanged: false, runtimeSecretsChanged: false }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
