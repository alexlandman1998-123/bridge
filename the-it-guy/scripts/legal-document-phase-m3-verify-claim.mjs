import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentReleaseClaim } from '../src/core/documents/legalDocumentReleaseClaim.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-m2-verify-receipt.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 900_000, maxBuffer: 30 * 1024 * 1024 })
let m2
try { m2 = JSON.parse(run.stdout) } catch { m2 = { status: 'UNAVAILABLE', ready: false } }
let receiptState
let claimState
try { receiptState = JSON.parse(fs.readFileSync('config/legal-document-release-receipt.json', 'utf8')) } catch { receiptState = { status: 'unavailable', receipt: null } }
try { claimState = JSON.parse(fs.readFileSync('config/legal-document-release-claim.json', 'utf8')) } catch { claimState = { status: 'unavailable', claim: null } }
const assessment = assessLegalDocumentReleaseClaim({ m2, receipt: receiptState.receipt, claim: claimState.claim, digest })
console.log(JSON.stringify({ phase: 'M3', status: assessment.ready ? 'READY_FOR_M4' : 'NO_GO', ready: assessment.ready, blockerCount: assessment.blockers.length, blockers: assessment.blockers, evidence: { m2Status: m2.status || 'UNAVAILABLE', receiptState: receiptState.status || 'UNAVAILABLE', claimState: claimState.status || 'UNAVAILABLE', releaseTarget: receiptState.receipt?.releaseTarget || null, expiresAt: assessment.expiresAt }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
