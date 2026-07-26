import assert from 'node:assert/strict'
import fs from 'node:fs'

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

const phase6 = readJson('config/document-generator-simple-signing-phase6-production-promotion.json')
const phase7 = readJson('config/document-generator-simple-signing-phase7-live-observation.json')
const packageJson = readJson('package.json')
const observer = fs.readFileSync('scripts/document-generator-simple-signing-phase7-live-observation.mjs', 'utf8')
const audit = fs.readFileSync('docs/audits/document-generator-simple-signing-phase-7.md', 'utf8')
const portalSource = fs.readFileSync('src/pages/SignerPortal.jsx', 'utf8')
const shellSource = fs.readFileSync('src/components/documents/SimpleSigningShell.jsx', 'utf8')

assert.equal(phase6.phase, 'document-generator-simple-signing-ui-phase-6')
assert.equal(phase6.status, 'production_promotion_plan_ready')
assert.equal(phase7.phase, 'document-generator-simple-signing-ui-phase-7')
assert.equal(phase7.status, 'live_observation_ready')
assert.equal(phase7.decision, 'ready_for_post_promotion_observation')
assert.equal(phase7.requiredPriorPhase, 'document-generator-simple-signing-ui-phase-6')
assert.equal(phase7.requiredCommandBeforeObservation, 'npm run test:document-generator-simple-signing-phase6')

assert.equal(phase7.production.appUrl, 'https://app.arch9.co.za')
assert.equal(phase7.production.supabaseProjectRef, 'isdowlnollckzvltkasn')
assert.equal(phase7.production.vercelProject, 'bridge')
assert.equal(phase7.production.route, '/sign/:token')
assert.deepEqual(phase7.releaseScope.packetTypes, ['mandate', 'otp'])
assert.equal(phase7.releaseScope.appliesToAllGeneratedDocumentsInScope, true)
assert.equal(phase7.releaseScope.documentGeneratorChanges, false)

for (const boundary of [
  'requiresDatabaseMigration',
  'requiresEdgeFunctionDeployment',
  'invokesSigningAction',
  'appliesSignatureFields',
  'completesSigning',
  'sendsRealCustomerEmails',
  'generatesFinalArtifacts',
  'resolvesFinalArtifactAccess',
  'changesCompletionTruth',
  'changesSigningTokenAuthority',
  'storesSigningTokenInReport',
]) {
  assert.equal(phase7.runtimeControls[boundary], false, `Phase 7 must not ${boundary}.`)
}
assert.equal(phase7.runtimeControls.redactsControlledToken, true)

for (const allowedCall of [
  'GET https://app.arch9.co.za/sign/[redacted-token]',
  'GET https://app.arch9.co.za/release-manifest.json',
  'POST resolve-signer-token',
]) {
  assert.ok(phase7.allowedProductionCalls.includes(allowedCall), `Phase 7 should allow ${allowedCall}.`)
}

for (const forbiddenCall of [
  'signer-signing-action',
  'dispatch-final-signed-document',
  'resolve-final-signed-document-access',
  'generate-final-signed-document',
  'send-email',
]) {
  assert.ok(phase7.forbiddenProductionCalls.includes(forbiddenCall), `Phase 7 should forbid ${forbiddenCall}.`)
  assert.ok(observer.includes(forbiddenCall), `Phase 7 observer should detect ${forbiddenCall}.`)
}

for (const observerReference of [
  'SIMPLE_SIGNING_PHASE7_CONTROLLED_TOKEN',
  '--live',
  '--write',
  'redacted-token',
  'release-manifest.json',
  "getByTestId('simple-signing-shell')",
  'simple-signing-progress',
  'simple-signing-document-card',
  'simple-signing-action-card',
  'simple-signing-help-card',
  'simple-signing-secure-footer',
  'resolve-signer-token',
  'PHASE7_FORBIDDEN_PRODUCTION_CALL',
  'controlledTokenRedacted: true',
]) {
  assert.ok(observer.includes(observerReference), `Phase 7 observer should keep ${observerReference}.`)
}

assert.equal(observer.includes('downloadUrl:'), false, 'Phase 7 observer must not print signed download URLs.')
assert.equal(observer.includes('recipient_email'), false, 'Phase 7 observer must not select or print recipient email addresses.')
assert.equal(observer.includes('fs.writeFileSync(reportPath'), true, 'Phase 7 observer should write a redacted report when requested.')

for (const simpleSurface of [
  '<SimpleSigningShell',
  'buildSimpleSigningExperienceModel',
  'documentPreview={simpleDocumentPreview}',
  'resolveExternalSignerSession',
]) {
  assert.ok(portalSource.includes(simpleSurface), `SignerPortal should retain ${simpleSurface}.`)
}

for (const shellMarker of [
  'data-testid="simple-signing-shell"',
  'data-testid="simple-signing-progress"',
  'data-testid="simple-signing-document-card"',
  'data-testid="simple-signing-action-card"',
  'data-testid="simple-signing-help-card"',
  'data-testid="simple-signing-secure-footer"',
]) {
  assert.ok(shellSource.includes(shellMarker), `Simple signing shell should keep ${shellMarker}.`)
}

for (const oldSurface of [
  '<DocumentRoleGuidanceCard',
  '<DocumentRoleActionBar',
  '<DocumentResponsibilityCard',
  '<DocumentJourneyProgress',
  '<DocumentMobileActionDock',
  '<DocumentAccessibilityNavigation',
]) {
  assert.equal(portalSource.includes(oldSurface), false, `Phase 7 live surface must not render ${oldSurface}.`)
}

for (const reference of [
  'post-promotion live observation gate',
  'SIMPLE_SIGNING_PHASE7_CONTROLLED_TOKEN',
  'redacts the token',
  'read-only observation',
  'production release manifest is reachable',
  'allows only the normal `resolve-signer-token` read',
  'does not invoke `signer-signing-action`',
  'does not send real customer emails',
  'does not generate final artifacts',
  'redeploy the previous production frontend artifact',
]) {
  assert.ok(audit.includes(reference), `Phase 7 audit should keep: ${reference}`)
}

assert.equal(
  packageJson.scripts['test:document-generator-simple-signing-phase7'],
  'npm run test:document-generator-simple-signing-phase6 && node scripts/document-generator-simple-signing-phase7-live-observation.test.mjs',
)

console.log('document-generator simple signing Phase 7 live observation guard passed.')
