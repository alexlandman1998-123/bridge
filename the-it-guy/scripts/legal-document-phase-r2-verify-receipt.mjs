import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentExpandedCohortReleaseReceipt } from '../src/core/documents/legalDocumentExpandedCohortReleaseReceipt.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-r1-release-authority.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 1_800_000, maxBuffer: 30 * 1024 * 1024 })
let r1
try { r1 = JSON.parse(run.stdout) } catch { r1 = { status: 'UNAVAILABLE', authorized: false, authority: null, mutatedData: false } }
let state
let activationState
try { state = JSON.parse(fs.readFileSync('config/legal-document-expanded-release-receipt.json', 'utf8')) } catch { state = { status: 'unavailable', receipt: null } }
try { activationState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8')) } catch { activationState = { status: 'unavailable', activation: null } }
const assessment = assessLegalDocumentExpandedCohortReleaseReceipt({ receipt: state.receipt, currentR1: r1, activation: activationState.activation, digest })
console.log(JSON.stringify({ phase: 'R2', status: assessment.ready ? 'READY_FOR_R3' : 'NO_GO', ready: assessment.ready, blockerCount: assessment.blockers.length, blockers: assessment.blockers, evidence: { receiptState: state.status || 'UNAVAILABLE', r1Status: r1.status || 'UNAVAILABLE', activationState: activationState.status || 'UNAVAILABLE', releaseTarget: state.receipt?.releaseTarget || null, sourceActivationDigest: state.receipt?.sourceActivationDigest || null, expiresAt: assessment.expiresAt }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
