import assert from 'node:assert/strict'
import fs from 'node:fs'

const portalSource = fs.readFileSync('src/pages/SignerPortal.jsx', 'utf8')
const shellSource = fs.readFileSync('src/components/documents/SimpleSigningShell.jsx', 'utf8')
const modelSource = fs.readFileSync('src/core/documents/simpleSigningExperienceModel.js', 'utf8')
const config = JSON.parse(fs.readFileSync('config/document-generator-simple-signing-phase3-portal-wiring.json', 'utf8'))
const audit = fs.readFileSync('docs/audits/document-generator-simple-signing-phase-3.md', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

assert.equal(config.phase, 'document-generator-simple-signing-ui-phase-3')
assert.equal(config.status, 'portal_wired')
assert.equal(config.inputContract, 'arch9-simple-signing-experience-model-v1')

for (const reference of [
  "import { buildSimpleSigningExperienceModel } from '../core/documents/simpleSigningExperienceModel'",
  "import SimpleSigningShell from '../components/documents/SimpleSigningShell'",
  'const simpleSigningModel = buildSimpleSigningExperienceModel({',
  '<SimpleSigningShell',
  'model={simpleSigningModel}',
  'documentPreview={simpleDocumentPreview}',
  'zoomPercent={Math.round(previewZoom * 100)}',
  'onPageCountChange={setPreviewPageCount}',
  'embedded',
]) {
  assert.ok(portalSource.includes(reference), `SignerPortal should include ${reference}`)
}

for (const apiReference of [
  'resolveExternalSignerSession({ token })',
  'applySignerField({',
  'saveSignerAsset({ token, assetType, dataUrl })',
  'completeSignerSigning({ token })',
  'resolveSignerFinalSignedArtifactAccess({',
]) {
  assert.ok(portalSource.includes(apiReference), `SignerPortal must preserve ${apiReference}`)
}

for (const actionId of [
  'view_document',
  'next_field',
  'finish_signing',
  'open_completed_pdf',
  'refresh_completion',
  'contact_support',
]) {
  assert.ok(portalSource.includes(`'${actionId}'`), `SignerPortal should route ${actionId}`)
}

for (const requiredRuntimePath of [
  'void handleUseSaved(nextField)',
  'void handleCompleteSigning()',
  'void handleOpenCompletedPdf()',
  'void handleRefreshCompletion()',
  'DocumentCommitConfirmation',
  'SigningCanvas',
  'DocumentOutcomeNotice',
]) {
  assert.ok(portalSource.includes(requiredRuntimePath), `SignerPortal should retain ${requiredRuntimePath}`)
}

for (const oldRenderedSurface of [
  '<DocumentRoleGuidanceCard',
  '<DocumentRoleActionBar',
  '<DocumentResponsibilityCard',
  '<DocumentJourneyProgress',
  '<DocumentMobileActionDock',
  '<DocumentAccessibilityNavigation',
  '<SigningCompleteScreen',
]) {
  assert.equal(portalSource.includes(oldRenderedSurface), false, `Phase 3 should not render ${oldRenderedSurface}`)
}

assert.ok(shellSource.includes('zoomPercent'), 'SimpleSigningShell should expose controlled zoom percent from SignerPortal')
assert.ok(modelSource.includes("return { id: 'refresh_completion', label: 'Check again' }"), 'Completed-without-final-artifact state should refresh, not fake an email/send action')

for (const boundary of [
  'does not change email delivery',
  'does not change final PDF generation',
  'does not change completion truth',
  'does not change token authority',
  'storage paths',
]) {
  assert.ok(audit.includes(boundary), `Phase 3 audit should document ${boundary}`)
}

assert.equal(
  packageJson.scripts['test:document-generator-simple-signing-phase3'],
  'node --test src/core/documents/__tests__/simpleSigningExperienceScope.test.js src/core/documents/__tests__/simpleSigningExperienceModel.test.js && node scripts/document-generator-simple-signing-phase2-shell.test.mjs && node scripts/document-generator-simple-signing-phase3-portal-wiring.test.mjs',
)

console.log('document-generator simple signing Phase 3 portal wiring guard passed.')
