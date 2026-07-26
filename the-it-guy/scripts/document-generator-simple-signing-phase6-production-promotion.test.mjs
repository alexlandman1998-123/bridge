import assert from 'node:assert/strict'
import fs from 'node:fs'

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

const phase5 = readJson('config/document-generator-simple-signing-phase5-release-readiness.json')
const phase6 = readJson('config/document-generator-simple-signing-phase6-production-promotion.json')
const phase4Report = readJson('test-results/document-generator-simple-signing-phase4/report.json')
const packageJson = readJson('package.json')
const portalSource = fs.readFileSync('src/pages/SignerPortal.jsx', 'utf8')
const shellSource = fs.readFileSync('src/components/documents/SimpleSigningShell.jsx', 'utf8')
const modelSource = fs.readFileSync('src/core/documents/simpleSigningExperienceModel.js', 'utf8')
const audit = fs.readFileSync('docs/audits/document-generator-simple-signing-phase-6.md', 'utf8')

assert.equal(phase5.phase, 'document-generator-simple-signing-ui-phase-5')
assert.equal(phase5.decision, 'ready_for_controlled_release')
assert.equal(phase6.phase, 'document-generator-simple-signing-ui-phase-6')
assert.equal(phase6.status, 'production_promotion_plan_ready')
assert.equal(phase6.decision, 'ready_for_production_promotion_after_phase5')
assert.equal(phase6.requiredPriorPhase, 'document-generator-simple-signing-ui-phase-5')
assert.equal(phase6.requiredCommandBeforePromotion, 'npm run test:document-generator-simple-signing-phase5')

assert.equal(phase6.production.appUrl, 'https://app.arch9.co.za')
assert.equal(phase6.production.supabaseProjectRef, 'isdowlnollckzvltkasn')
assert.equal(phase6.production.vercelProject, 'bridge')
assert.equal(phase6.production.route, '/sign/:token')

assert.deepEqual(phase6.releaseScope.packetTypes, ['mandate', 'otp'])
assert.equal(phase6.releaseScope.surface, 'signer_portal')
assert.equal(phase6.releaseScope.appliesToAllGeneratedDocumentsInScope, true)
assert.equal(phase6.releaseScope.documentGeneratorChanges, false)

assert.equal(phase6.source.requiresCleanGitTree, true)
assert.equal(phase6.source.requiresCommittedPhase6Manifest, true)
assert.equal(phase6.source.deploymentIsSeparateOperatorAction, true)

for (const boundary of [
  'requiresDatabaseMigration',
  'requiresEdgeFunctionDeployment',
  'changesEmailDispatch',
  'sendsRealCustomerEmails',
  'changesFinalArtifactGeneration',
  'changesFinalCompletionTruth',
  'changesSigningTokenAuthority',
  'changesStorageAccess',
]) {
  assert.equal(phase6.runtimeBoundaries[boundary], false, `Phase 6 must not ${boundary}.`)
}

assert.equal(phase4Report.phase, 'document-generator-simple-signing-ui-phase-4')
assert.equal(phase4Report.status, 'browser_smoke_passed')
assert.equal(phase4Report.mutatedData, false)
assert.equal(phase4Report.sentRealEmails, false)
const evidenceIds = new Set(phase4Report.evidence.map((item) => item.id))
assert.ok(evidenceIds.has('mandate-seller-mobile'), 'Phase 6 requires mandate signer route browser evidence.')
assert.ok(evidenceIds.has('otp-purchaser-desktop'), 'Phase 6 requires OTP signer route browser evidence.')

for (const apiReference of [
  'resolveExternalSignerSession',
  'saveSignerAsset',
  'applySignerField',
  'completeSignerSigning',
  'resolveSignerFinalSignedArtifactAccess',
]) {
  assert.ok(portalSource.includes(apiReference), `SignerPortal should preserve ${apiReference}.`)
}

for (const simpleSurface of [
  '<SimpleSigningShell',
  'buildSimpleSigningExperienceModel',
  'documentPreview={simpleDocumentPreview}',
  'onPageCountChange={setPreviewPageCount}',
]) {
  assert.ok(portalSource.includes(simpleSurface), `SignerPortal should retain ${simpleSurface}.`)
}

for (const oldSurface of [
  '<DocumentRoleGuidanceCard',
  '<DocumentRoleActionBar',
  '<DocumentResponsibilityCard',
  '<DocumentJourneyProgress',
  '<DocumentMobileActionDock',
  '<DocumentAccessibilityNavigation',
]) {
  assert.equal(portalSource.includes(oldSurface), false, `Phase 6 production surface must not render ${oldSurface}.`)
}

assert.ok(shellSource.includes('data-testid="simple-signing-shell"'), 'Simple signing shell test id must remain available for live smoke.')
assert.ok(shellSource.includes('data-testid="simple-signing-secure-footer"'), 'Simple signing secure footer test id must remain available for live smoke.')
assert.ok(modelSource.includes('Powered by Arch9'), 'Simple signing model must keep branded secure footer copy.')
assert.ok(modelSource.includes('mutatedData: false'), 'Simple signing model must continue to declare no data mutation.')
assert.equal(modelSource.includes('downloadUrl:'), false, 'Simple signing model must not expose raw storage URLs.')

for (const checklistItem of [
  'run npm run test:document-generator-simple-signing-phase5',
  'deploy the app frontend only',
  'run a live read-only signer route smoke against a controlled signing token',
  'rollback by redeploying the previous production frontend artifact if the signer route regresses',
]) {
  assert.ok(phase6.promotionChecklist.includes(checklistItem), `Phase 6 checklist should include ${checklistItem}.`)
}

for (const reference of [
  'https://app.arch9.co.za',
  'isdowlnollckzvltkasn',
  'npm run test:document-generator-simple-signing-phase5',
  'does not deploy the app',
  'no database migrations',
  'no Edge Function changes',
  'does not send real customer emails',
  'redeploy the previous production frontend artifact',
]) {
  assert.ok(audit.includes(reference), `Phase 6 audit should keep: ${reference}`)
}

assert.equal(
  packageJson.scripts['test:document-generator-simple-signing-phase6'],
  'npm run test:document-generator-simple-signing-phase5 && node scripts/document-generator-simple-signing-phase6-production-promotion.test.mjs',
)

console.log('document-generator simple signing Phase 6 production promotion guard passed.')
