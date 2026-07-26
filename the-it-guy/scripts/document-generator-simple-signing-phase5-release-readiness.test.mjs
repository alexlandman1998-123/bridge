import assert from 'node:assert/strict'
import fs from 'node:fs'

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function assertFileExists(filePath, message) {
  assert.ok(fs.existsSync(filePath), message || `${filePath} should exist.`)
  assert.ok(fs.statSync(filePath).size > 0, `${filePath} should not be empty.`)
}

const phase0 = readJson('config/document-generator-simple-signing-phase0-scope.json')
const phase1 = readJson('config/document-generator-simple-signing-phase1-model.json')
const phase2 = readJson('config/document-generator-simple-signing-phase2-shell.json')
const phase3 = readJson('config/document-generator-simple-signing-phase3-portal-wiring.json')
const phase4 = readJson('config/document-generator-simple-signing-phase4-browser-smoke.json')
const phase5 = readJson('config/document-generator-simple-signing-phase5-release-readiness.json')
const packageJson = readJson('package.json')
const report = readJson('test-results/document-generator-simple-signing-phase4/report.json')

const portalSource = fs.readFileSync('src/pages/SignerPortal.jsx', 'utf8')
const shellSource = fs.readFileSync('src/components/documents/SimpleSigningShell.jsx', 'utf8')
const modelSource = fs.readFileSync('src/core/documents/simpleSigningExperienceModel.js', 'utf8')
const audit = fs.readFileSync('docs/audits/document-generator-simple-signing-phase-5.md', 'utf8')

assert.equal(phase0.phase, 'document-generator-simple-signing-ui-phase-0')
assert.equal(phase1.phase, 'document-generator-simple-signing-ui-phase-1')
assert.equal(phase2.phase, 'document-generator-simple-signing-ui-phase-2')
assert.equal(phase3.phase, 'document-generator-simple-signing-ui-phase-3')
assert.equal(phase4.phase, 'document-generator-simple-signing-ui-phase-4')
assert.equal(phase5.phase, 'document-generator-simple-signing-ui-phase-5')
assert.equal(phase5.status, 'release_readiness_ready')
assert.equal(phase5.decision, 'ready_for_controlled_release')
assert.deepEqual(phase5.releaseScope.packetTypes, ['mandate', 'otp'])
assert.equal(phase5.releaseScope.appliesToAllGeneratedDocumentsInScope, true)

for (const boundary of [
  'changesEmailDispatch',
  'sendsRealCustomerEmails',
  'changesFinalArtifactGeneration',
  'changesFinalCompletionTruth',
  'changesSigningTokenAuthority',
  'changesStorageAccess',
  'performsDeployment',
]) {
  assert.equal(phase5.backendBoundaries[boundary], false, `Phase 5 must not ${boundary}.`)
}

assert.equal(report.phase, 'document-generator-simple-signing-ui-phase-4')
assert.equal(report.status, 'browser_smoke_passed')
assert.equal(report.mutatedData, false)
assert.equal(report.sentRealEmails, false)
assert.equal(report.evidence.length, 2)

const evidenceById = new Map(report.evidence.map((item) => [item.id, item]))
const mandateEvidence = evidenceById.get('mandate-seller-mobile')
const otpEvidence = evidenceById.get('otp-purchaser-desktop')
assert.ok(mandateEvidence, 'Phase 5 requires mandate seller mobile evidence.')
assert.ok(otpEvidence, 'Phase 5 requires OTP purchaser desktop evidence.')
assert.equal(mandateEvidence.fullFlow, true)
assert.equal(otpEvidence.fullFlow, false)
assert.equal(mandateEvidence.horizontalOverflowPx, 0)
assert.equal(otpEvidence.horizontalOverflowPx, 0)
assertFileExists(mandateEvidence.screenshot, 'Mandate mobile screenshot should exist.')
assertFileExists(otpEvidence.screenshot, 'OTP desktop screenshot should exist.')

const mandateActions = mandateEvidence.callTrace.map((call) => `${call.functionName}:${call.action}`)
for (const action of [
  'resolve-signer-token:resolve',
  'signer-signing-action:upsert_asset',
  'signer-signing-action:apply_field',
  'signer-signing-action:complete_signing',
]) {
  assert.ok(mandateActions.includes(action), `Mandate full-flow evidence should include ${action}.`)
}
for (const call of [...mandateEvidence.callTrace, ...otpEvidence.callTrace]) {
  assert.notEqual(call.functionName, 'dispatch-final-signed-document', 'Phase 5 must not send real signing emails.')
  assert.notEqual(call.functionName, 'resolve-final-signed-document-access', 'Phase 5 readiness must not fetch final artifacts.')
}

for (const renderedSurface of [
  '<SimpleSigningShell',
  'buildSimpleSigningExperienceModel',
  'DocumentCommitConfirmation',
  'SigningCanvas',
  'resolveExternalSignerSession',
  'saveSignerAsset',
  'applySignerField',
  'completeSignerSigning',
]) {
  assert.ok(portalSource.includes(renderedSurface), `SignerPortal should retain ${renderedSurface}.`)
}

for (const oldSurface of [
  '<DocumentRoleGuidanceCard',
  '<DocumentRoleActionBar',
  '<DocumentResponsibilityCard',
  '<DocumentJourneyProgress',
  '<DocumentMobileActionDock',
  '<DocumentAccessibilityNavigation',
]) {
  assert.equal(portalSource.includes(oldSurface), false, `SignerPortal should not render ${oldSurface}.`)
}

for (const shellMarker of [
  'data-testid="simple-signing-shell"',
  'data-testid="simple-signing-progress"',
  'data-testid="simple-signing-document-card"',
  'data-testid="simple-signing-action-card"',
  'data-testid="simple-signing-help-card"',
  'data-testid="simple-signing-secure-footer"',
  'refresh_completion',
]) {
  assert.ok(shellSource.includes(shellMarker), `Simple signing shell should keep ${shellMarker}.`)
}

assert.ok(modelSource.includes('previewAvailable'), 'The simple model should keep preview availability as metadata only.')
assert.equal(modelSource.includes('downloadUrl:'), false, 'The simple model must not expose raw download URLs.')

for (const reference of [
  'does not deploy the application',
  'does not call production Supabase',
  'does not send real customer emails',
  'not permission to send real customer emails',
  'Phase 4 writes a browser smoke report',
  'old signer role/action/mobile cards are absent',
]) {
  assert.ok(audit.includes(reference), `Phase 5 audit should keep: ${reference}`)
}

assert.equal(
  packageJson.scripts['test:document-generator-simple-signing-phase5'],
  'npm run test:document-generator-simple-signing-phase4 && npm run build && node scripts/document-generator-simple-signing-phase5-release-readiness.test.mjs',
)

console.log('document-generator simple signing Phase 5 release readiness guard passed.')
