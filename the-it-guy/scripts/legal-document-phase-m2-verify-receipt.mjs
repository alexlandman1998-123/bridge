import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assessLegalDocumentReleaseReceipt, canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const run = spawnSync(process.execPath, ['scripts/legal-document-phase-m1-release-authority.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 800_000, maxBuffer: 30 * 1024 * 1024 })
let m1
try { m1 = JSON.parse(run.stdout) } catch { m1 = { status: 'UNAVAILABLE', authorized: false } }
let state
try { state = JSON.parse(fs.readFileSync('config/legal-document-release-receipt.json', 'utf8')) } catch { state = { status: 'unavailable', receipt: null } }
const assessment = assessLegalDocumentReleaseReceipt({ m1, receipt: state.receipt, digest })
console.log(JSON.stringify({ phase: 'M2', status: assessment.ready ? 'READY_FOR_M3' : 'NO_GO', ready: assessment.ready, blockerCount: assessment.blockers.length, blockers: assessment.blockers, evidence: { m1Status: m1.status || 'UNAVAILABLE', receiptState: state.status || 'UNAVAILABLE', releaseTarget: m1.releaseTarget || null, expiresAt: assessment.expiresAt }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
