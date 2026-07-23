import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (path) => fs.readFileSync(path, 'utf8')
const between = (source, start, end) => {
  const startIndex = source.indexOf(start)
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`)
  return source.slice(startIndex, endIndex)
}

const finaliser = read('../supabase/functions/generate-final-signed-document/index.ts')
const signerTokenResolver = read('../supabase/functions/resolve-signer-token/index.ts')
const artifactResolver = read('../supabase/functions/resolve-final-signed-document-access/index.ts')
const signerAction = read('../supabase/functions/signer-signing-action/index.ts')
const finalDeliveryDispatcher = read('../supabase/functions/dispatch-final-signed-document/index.ts')
const genericEmailRouter = read('../supabase/functions/send-email/index.ts')
const legalWorkspacePage = read('src/pages/LegalDocumentWorkspacePage.jsx')
const externalSigningApi = read('src/lib/externalSigningApi.js')
const signerPortal = read('src/pages/SignerPortal.jsx')
const completionContract = read('src/core/documents/signingCompletionContract.js')
const completionAccess = read('src/core/documents/signingCompletionAccess.js')
const documentPacketsApi = read('src/lib/documentPacketsApi.js')

const finaliserDescriptor = between(
  finaliser,
  'function buildFinalArtifactAccessDescriptor',
  'function buildFinalisationVersionDescriptor',
)
for (const token of [
  'resolver: "resolve-final-signed-document-access"',
  'packetId:',
  'packetVersionId:',
  'documentId:',
  'fileName:',
  'sha256:',
  'byteLength:',
]) {
  assert.ok(finaliserDescriptor.includes(token), `Finaliser descriptor must retain ${token}`)
}
assert.doesNotMatch(
  finaliserDescriptor,
  /^\s*(bucket|path|url|signedUrl|downloadUrl)\s*:/m,
  'Finaliser response descriptors must not transport storage coordinates or signed URLs.',
)
assert.doesNotMatch(finaliser, /const finalSignedUrl\b|let existingUrl\b/, 'Finaliser must not mint a final signed URL for its response.')
assert.match(finaliser, /finalArtifact: buildFinalArtifactAccessDescriptor\([\s\S]*?version: buildFinalisationVersionDescriptor\([\s\S]*?finalDelivery: buildFinalDeliverySummary\(/, 'Both finalisation success paths must emit only safe descriptors and delivery summaries.')
assert.doesNotMatch(finaliser, /version:\s*updateVersionData\b/, 'Raw F2 version rows must not be returned by the finaliser.')

const signerDescriptor = between(
  signerTokenResolver,
  'function buildFinalArtifactAccessDescriptor',
  'function normalizeSigningRole',
)
assert.match(signerDescriptor, /resolver: "resolve-final-signed-document-access"/)
assert.doesNotMatch(
  signerDescriptor,
  /^\s*(bucket|path|url|signedUrl|downloadUrl)\s*:/m,
  'Public signer-token completion descriptors must omit storage coordinates and URLs.',
)
assert.doesNotMatch(signerTokenResolver, /const finalSignedUrl\b/, 'Signer-token resolution must not mint a final signed URL.')
assert.match(signerTokenResolver, /const finalArtifactEvidenceValid = Boolean\(finalArtifactEvidence\)[\s\S]*?const finalArtifactReady = finalArtifactEvidenceValid[\s\S]*?completionReceiptValid[\s\S]*?portalPublicationValid/, 'Signer-token completion readiness must require evidence and publication checks before advertising the resolver descriptor.')

for (const token of [
  '"signer"',
  'authorizeSigner',
  '.eq("signing_token", signingToken)',
  '.eq("packet_id", packetId)',
  '.eq("packet_version_id", packetVersionId)',
]) {
  assert.ok(artifactResolver.includes(token), `Signer resolver authorization must retain ${token}`)
}
assert.match(artifactResolver, /status\)\.toLowerCase\(\) ===\s*"signed"/, 'Signer resolver authorization must require a signed signer.')
assert.match(artifactResolver, /context === "signer"[\s\S]*?authorizeSigner\(\s*\{[\s\S]*?admin,[\s\S]*?signingToken,[\s\S]*?packetId,[\s\S]*?packetVersionId,[\s\S]*?\}\s*\)/, 'The final-artifact resolver must authorize a signer only for its exact packet-version.')

assert.match(signerAction, /function buildPublicFinalArtifactDescriptor[\s\S]*?resolver: "resolve-final-signed-document-access"/)
assert.match(signerAction, /finalArtifact: buildPublicFinalArtifactDescriptor\(retryBody\?\.finalArtifact, packetId, packetVersionId\)/, 'Signer retry responses must sanitize finaliser output before returning to the public signer.')
assert.doesNotMatch(signerAction, /finalArtifact: retryBody\?\.finalArtifact/, 'Signer retry responses must not pass a finaliser payload through unchanged.')

assert.match(externalSigningApi, /resolveSignerFinalSignedArtifactAccess[\s\S]*?context: 'signer'[\s\S]*?signingToken[\s\S]*?action: download \? 'download' : 'status'/, 'The signer browser client must obtain final copies through the resolver.')
assert.match(signerPortal, /resolveSignerFinalSignedArtifactAccess[\s\S]*?handleOpenCompletedPdf[\s\S]*?download: true/, 'The signer portal must request a fresh resolver-issued download URL.')
assert.doesNotMatch(signerPortal, /const finalUrl = normalizeText\(finalArtifact\.url\)/, 'The signer completion screen must not consume a URL embedded in the session payload.')
assert.match(completionContract, /const finalArtifactReady = finalArtifact\.ready === true \|\| Boolean\(finalPath \|\| finalUrl\)/, 'The completion contract must preserve a safe resolver descriptor as ready.')
assert.match(completionAccess, /completion\.finalArtifact\.documentId[\s\S]*?completion\.finalArtifact\.packetId && completion\.finalArtifact\.packetVersionId/, 'Completion polling must accept identity-only final-artifact descriptors.')

const workspaceFinalisation = between(
  documentPacketsApi,
  'export async function generateFinalSignedDocument',
  'export async function checkDocumentConversionHealth',
)
assert.match(workspaceFinalisation, /const finalArtifactDocumentId = normalizeText\(finalArtifact\?\.documentId/)
assert.match(workspaceFinalisation, /finalArtifactDocumentId: finalArtifactDocumentId \|\| null/)
assert.doesNotMatch(workspaceFinalisation, /response\?\.finalArtifact\?\.path|final_artifact_path: finalArtifactPath/, 'Workspace finalisation caches and lifecycle events must retain only final-artifact identity, not a storage path.')

// Final signed emails are a separate egress boundary: the browser and generic
// email router cannot prove that a supplied URL belongs to the completed F2/F3/F4
// artifact. Only the service-only dispatcher may hand a signer-bound
// application route to the signed-email handler; the application must perform
// final-artifact authorization at click time.
assert.doesNotMatch(legalWorkspacePage, /getSignedMandateNotificationContext|seller_mandate_signed/, 'The legal-document browser workspace must not compose or send signed-document emails.')
assert.match(genericEmailRouter, /isRetiredFinalSignedLegalDocumentEmailType\(type\)/, 'The generic email router must fail closed for final signed legal-document types.')
assert.match(genericEmailRouter, /FINAL_SIGNED_LEGAL_DOCUMENT_DELIVERY_ROUTE_RETIRED/, 'Generic final-document requests must have a stable retired-route code.')
assert.doesNotMatch(genericEmailRouter, /handleSellerMandateSignedEmail|SendSellerMandateSignedPayload/, 'The generic email router must not import or invoke the signed-document handler.')
assert.match(finalDeliveryDispatcher, /import \{ handleSellerMandateSignedEmail \}/, 'Canonical final delivery must own the signed-document email handler.')
assert.match(finalDeliveryDispatcher, /assessControlledTestRecipient/, 'Canonical final delivery must preserve controlled-test recipient suppression after bypassing the generic router.')
assert.match(finalDeliveryDispatcher, /FINAL_EMAIL_RECIPIENT_SUPPRESSED/, 'Suppressed test recipients must be recorded without calling the external provider.')
assert.match(finalDeliveryDispatcher, /if \(errorCode !== "FINAL_EMAIL_SIGNER_ACCESS_TOKEN_MISSING"\)/, 'A missing signer-bound resolver token must retain a stable F3 failure classification.')
assert.match(finalDeliveryDispatcher, /const emailResponse = await handleSellerMandateSignedEmail\(\{[\s\S]*?downloadLink: `\$\{resolveAppBaseUrl\(\)\}\/sign\/\$\{encodeURIComponent\(signerToken\)\}`/, 'Only canonical final delivery may pass a signer-bound resolver route to the mail handler.')
assert.doesNotMatch(finalDeliveryDispatcher, /createSignedUrl\(/, 'Final email delivery must never emit a raw storage signed URL.')
assert.doesNotMatch(finalDeliveryDispatcher, /functions\/v1\/send-email/, 'Canonical final delivery must not re-enter the generic email endpoint.')
const f2Index = finalDeliveryDispatcher.indexOf('FINAL_DELIVERY_F2_INVALID')
const f3Index = finalDeliveryDispatcher.indexOf('F3_TRANSACTION_PUBLICATION_FAILED')
const f4Index = finalDeliveryDispatcher.indexOf('F4_SURFACE_COMPLETION_FAILED')
const signedEmailIndex = finalDeliveryDispatcher.indexOf('const emailResponse = await handleSellerMandateSignedEmail')
assert.ok(f2Index >= 0 && f3Index > f2Index && f4Index > f3Index && signedEmailIndex > f4Index, 'The canonical dispatcher must validate F2, F3, and F4 before signed-document egress.')
assert.doesNotMatch(signerAction, /handleSellerMandateSignedEmail|sendFinalSignedMandateEmails|seller_mandate_signed/, 'Public signer completion must not preserve a final-document email fallback.')
const finalEmailHandlerOwners = fs.readdirSync('../supabase/functions', { recursive: true })
  .filter((file) => String(file).endsWith('.ts'))
  .filter((file) => read(path.join('../supabase/functions', String(file))).includes('handleSellerMandateSignedEmail'))
  .map((file) => String(file).replaceAll('\\', '/'))
  .sort()
assert.deepEqual(
  finalEmailHandlerOwners,
  [
    'dispatch-final-signed-document/index.ts',
    'send-email/handlers/sellerMandateSigned.ts',
  ],
  'The signed-document email handler may be referenced only by the canonical dispatcher.',
)

const pkg = JSON.parse(read('package.json'))
assert.ok(pkg.scripts?.['test:legal-documents-phase5-egress'], 'Package scripts must expose the Phase 5 egress regression check.')

console.log('Phase 5 final-artifact egress closure checks passed.')
