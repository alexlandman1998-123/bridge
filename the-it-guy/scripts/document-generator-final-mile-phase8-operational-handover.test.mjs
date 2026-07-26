import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const script = fs.readFileSync('scripts/document-generator-final-mile-phase8-operational-handover.mjs', 'utf8')
const config = JSON.parse(fs.readFileSync('config/legal-document-final-mile-phase8-operational-handover.json', 'utf8'))
const audit = fs.readFileSync('docs/audits/document-generator-final-mile-phase-8.md', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

assert.equal(config.phase, 'document-generator-final-mile-phase-8')
assert.equal(config.production.appUrl, 'https://app.arch9.co.za')
assert.equal(config.production.projectRef, 'isdowlnollckzvltkasn')
assert.equal(config.release.expectedReleaseId, '05f5f20d14ee3a6e1ef50b8c180b078cf28a7b77')
assert.equal(config.controls.noDispatcherInvocationRequired, true)
assert.equal(config.controls.noEmailSendRequired, true)
assert.equal(config.controls.signedDownloadUrlsRedacted, true)
assert.equal(config.controls.recipientEmailsRedacted, true)

for (const reference of [
  'document-generator-final-mile-phase-7-observation.json',
  'PHASE8_PHASE7_REPORT_NOT_HEALTHY',
  'PHASE8_OBSERVATION_STALE',
  'PHASE8_FINAL_DOWNLOAD_URL_MISSING',
  'pause_final_mile_and_investigate',
  'keep_live',
  '--refresh-live-observation',
  '--allow-local-release-drift',
]) {
  assert.ok(script.includes(reference), `Phase 8 handover should keep ${reference}`)
}

for (const forbidden of [
  'dispatch-final-signed-document',
  'provider_message_id',
  'recipient_email',
  'downloadUrl:',
]) {
  assert.doesNotMatch(script, new RegExp(forbidden), `Phase 8 decision should not expose ${forbidden}`)
}

const run = spawnSync(process.execPath, [
  'scripts/document-generator-final-mile-phase8-operational-handover.mjs',
  '--input',
  'docs/audits/document-generator-final-mile-phase-7-observation.json',
  '--max-age-minutes=10000000',
], { cwd: process.cwd(), encoding: 'utf8', timeout: 30_000 })
assert.equal(run.status, 0, run.stderr || run.stdout)
const decision = JSON.parse(run.stdout)
assert.equal(decision.phase, 'document-generator-final-mile-phase-8')
assert.equal(decision.status, 'GO')
assert.equal(decision.decision, 'keep_live')
assert.equal(decision.operationalState.customerUseBlocked, false)
assert.equal(decision.controls.noEmailSendRequired, true)
assert.equal(decision.blockers.length, 0)

for (const reference of [
  'go/no-go',
  'does not send email',
  'does not invoke dispatch',
  'pause_final_mile_and_investigate',
  'keep_live',
]) {
  assert.ok(audit.includes(reference), `Phase 8 audit should keep ${reference}`)
}

assert.equal(
  packageJson.scripts['test:document-generator-final-mile-phase8'],
  'node scripts/document-generator-final-mile-phase8-operational-handover.test.mjs',
)
assert.equal(
  packageJson.scripts['verify:document-generator-final-mile:production'],
  'node --env-file=.env.production.local scripts/document-generator-final-mile-phase7-production-observation.mjs --write --allow-local-release-drift && node scripts/document-generator-final-mile-phase8-operational-handover.mjs --write',
)

console.log('document-generator final-mile Phase 8 operational handover guard passed.')
