import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
const cron = readFileSync('api/cron/document-request-canonical-automation.js', 'utf8')
const automation = readFileSync('scripts/document-request-canonical-phase16-automation.mjs', 'utf8')
const docs = readFileSync('docs/document-request-phase18-scheduled-activation.md', 'utf8')

const jobs = vercel.crons || []
const documentRequestJobs = jobs.filter((job) => job.path === '/api/cron/document-request-canonical-automation')

assert.equal(documentRequestJobs.length, 1, 'Phase 18 should schedule exactly one document-request automation cron.')
assert.equal(documentRequestJobs[0].schedule, '30 1 * * *', 'Phase 18 should schedule the job at 01:30 UTC daily.')
assert.ok(
  !jobs.some((job) => job.path === '/api/cron/transaction-progress-notifications'),
  'Phase 18 must not accidentally schedule the transaction-progress cron endpoint.',
)

assert.match(cron, /CRON_SECRET/, 'Scheduled endpoint should remain protected by CRON_SECRET.')
assert.match(cron, /--scheduling-enabled/, 'Scheduled endpoint should mark reports as scheduled.')
assert.match(cron, /PHASE18_PILOT_TRANSACTION_IDS/, 'Phase 18 scheduled activation should default to the verified pilot cohort.')
assert.match(
  cron,
  /DOCUMENT_REQUEST_CANONICAL_AUTOMATION_TRANSACTION_IDS/,
  'Phase 18 should allow the scheduled cohort to be changed through env after wider mapping.',
)
assert.match(cron, /DOCUMENT_REQUEST_CANONICAL_AUTOMATION_COMMIT/, 'Scheduled writes should require the commit env flag.')
assert.match(cron, /if \(commitEnabled\) args\.push\('--commit', '--confirm-automation'\)/, 'Cron should default to dry-run when commit env is absent.')
assert.match(cron, /maxDuration:\s*300/, 'Cron endpoint should declare enough duration for rollout verification.')
assert.match(automation, /schedulingEnabled:\s*options\.schedulingEnabled === true/, 'Automation report should expose scheduled activation state.')
assert.match(docs, /30 1 \* \* \*/, 'Phase 18 docs should record the cron schedule.')
assert.match(docs, /DOCUMENT_REQUEST_CANONICAL_AUTOMATION_COMMIT=true/, 'Phase 18 docs should document the write-mode env gate.')

console.log('document request canonical phase 18 scheduled activation contract tests passed')
