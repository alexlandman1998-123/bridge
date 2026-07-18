import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentExpandedCohortReleaseClaim } from '../src/core/documents/legalDocumentExpandedCohortReleaseClaim.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-r2-verify-receipt.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_800_000, maxBuffer: 30 * 1024 * 1024 })
let r2
try { r2 = JSON.parse(run.stdout) } catch { r2 = { status: 'UNAVAILABLE', ready: false, mutatedData: false } }
let receiptState
let claimState
let activationState
try { receiptState = JSON.parse(fs.readFileSync('config/legal-document-expanded-release-receipt.json', 'utf8')) } catch { receiptState = { status: 'unavailable', receipt: null } }
try { claimState = JSON.parse(fs.readFileSync('config/legal-document-expanded-release-claim.json', 'utf8')) } catch { claimState = { status: 'unavailable', claim: null } }
try { activationState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8')) } catch { activationState = { status: 'unavailable', activation: null } }
const assessment = assessLegalDocumentExpandedCohortReleaseClaim({ r2, receipt: receiptState.receipt, claim: claimState.claim, activation: activationState.activation, digest })
console.log(JSON.stringify({ phase: 'R3', status: assessment.ready ? 'READY_FOR_S1' : 'NO_GO', ready: assessment.ready, blockerCount: assessment.blockers.length, blockers: assessment.blockers, evidence: { r2Status: r2.status || 'UNAVAILABLE', receiptState: receiptState.status || 'UNAVAILABLE', claimState: claimState.status || 'UNAVAILABLE', activationState: activationState.status || 'UNAVAILABLE', releaseTarget: receiptState.receipt?.releaseTarget || null, sourceActivationDigest: claimState.claim?.sourceActivationDigest || null, expiresAt: assessment.expiresAt }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
