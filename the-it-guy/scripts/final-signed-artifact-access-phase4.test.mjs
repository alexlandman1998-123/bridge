import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const between = (source, start, end = '') => {
  const startIndex = source.indexOf(start)
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`)
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : -1
  return source.slice(startIndex, endIndex === -1 ? undefined : endIndex)
}

const resolver = read('../supabase/functions/_shared/finalSignedArtifactAccess.ts')
const endpoint = read('../supabase/functions/resolve-final-signed-document-access/index.ts')
const clientAccess = read('src/core/documents/finalSignedArtifactAccess.js')
const clientApi = read('src/lib/api.js')
const sellerApi = read('src/services/privateListingService.js')
const sellerWorkspace = read('src/services/clientPortalWorkspaceService.js')
const clientPortal = read('src/pages/ClientPortal.jsx')
const legalWorkspace = read('src/components/documents/LegalDocumentWorkspace.jsx')
const packetApi = read('src/lib/documentPacketsApi.js')
const sellerPortalFenceMigration = read('../supabase/migrations/202607220010_phase4_seller_portal_final_artifact_fence.sql')
const sellerPortalStagingVerifier = read('scripts/verify-browser-entry-blockers-staging.mjs')

for (const token of [
  'legal_final_artifact_evidence',
  'document_packet_events',
  'final_signed_document_generated',
  'PHASE3_SIGNATURE_EVIDENCE_CONTRACT',
  'PHASE3_SIGNATURE_EVIDENCE_MODE',
  'signature_asset_fingerprints_json',
  'final_signed_document_id',
  'visibility_scope',
  'is_client_visible',
  'stage_key',
  'resolvePublishedFinalSignedArtifact',
]) {
  assert.ok(resolver.includes(token), `Final-artifact resolver must retain ${token}.`)
}
assert.match(
  resolver,
  /normalizeFinalArtifactText\(document\.file_path\)\s*===\s*normalizeFinalArtifactText\(evidence\.path\)[\s\S]*?normalizeFinalArtifactText\(document\.file_bucket\)\s*===\s*normalizeFinalArtifactText\(evidence\.bucket\)[\s\S]*?lower\(document\.visibility_scope\)\s*===\s*"shared"[\s\S]*?document\.is_client_visible\s*===\s*true[\s\S]*?lower\(document\.stage_key\)\s*===\s*"final_signed"/,
  'A final URL must require the exact published/shared/client-visible Documents row.',
)
assert.ok(
  resolver.indexOf('isPublishedFinalDocumentExact') < resolver.indexOf('.createSignedUrl('),
  'Document publication verification must precede signed URL creation.',
)
assert.match(
  resolver,
  /normalizeFinalArtifactText\(evidence\.path\)\s*===\s*finalPath[\s\S]*?normalizeFinalArtifactText\(evidence\.bucket\)\s*===\s*finalBucket[\s\S]*?lower\(payload\.finalArtifactSha256\)\s*===\s*lower\(evidence\.sha256\)[\s\S]*?Number\(payload\.finalArtifactByteLength\)\s*===\s*byteLength/,
  'F2 evidence, packet version, and finalisation event must bind the same artifact.',
)

assert.match(
  resolver,
  /sameJson\(\s*payload\.signatureAssetFingerprints,\s*evidence\.signature_asset_fingerprints_json,?\s*\)/,
  'The canonical event must bind the exact F2 signature-fingerprint evidence.',
)

for (const token of [
  'authorizeClientPortal',
  'authorizeSellerPortal',
  'authorizeWorkspace',
  'resolvePublishedFinalSignedArtifact',
  'final_signed_document_id',
  'FINAL_ACCESS_DENIED',
]) {
  assert.ok(endpoint.includes(token), `Access endpoint must retain ${token}.`)
}
assert.match(
  endpoint,
  /context === "client_portal"[\s\S]*?authorizeClientPortal[\s\S]*?context === "seller_portal"[\s\S]*?authorizeSellerPortal[\s\S]*?authorizeWorkspace/,
  'Each client, seller, and workspace surface must be separately authorized.',
)
assert.match(
  endpoint,
  /const documentId = normalizeFinalArtifactText\(\s*payload\.documentId \|\| payload\.document_id,?\s*\)[\s\S]*?\.eq\("final_signed_document_id", documentId\)[\s\S]*?documentId,/,
  'A Documents Centre descriptor must resolve its canonical packet/version only on the trusted server.',
)
assert.ok(
  endpoint.indexOf('if (!authorized)') < endpoint.indexOf('const resolved = await resolvePublishedFinalSignedArtifact'),
  'Portal authorization must complete before the server verifies or exposes an F2-linked artifact.',
)

assert.match(
  clientAccess,
  /catch \(error\) \{[\s\S]*?unavailableFinalArtifactAccess/,
  'Offline or Edge-function failure must fail closed without a URL.',
)
assert.match(
  clientApi,
  /finalSignedFilePath: ''[\s\S]*?finalSignedDownloadUrl: ''[\s\S]*?finalSignedAccess/,
  'Client-portal packet summaries must expose resolver state, not raw final URLs.',
)
assert.match(
  clientApi,
  /toClientPortalFinalSignedDocumentDescriptor[\s\S]*?canonicalFinalArtifact: true[\s\S]*?finalDocumentId: document\?\.id[\s\S]*?file_path: ''[\s\S]*?url: ''/,
  'Buyer Documents Centre final rows must become no-path resolver descriptors.',
)
assert.match(
  clientApi,
  /clientPortalFinalArtifactDescriptors: true/,
  'Both buyer portal loaders must request final-artifact descriptors before document URL enrichment.',
)
assert.doesNotMatch(
  clientApi,
  /assertClientPortalPathIsNotCanonicalFinalArtifact/,
  'Generic portal document downloads must not depend on an RLS-unavailable final-version lookup.',
)
assert.doesNotMatch(
  clientApi,
  /from\("document_packet_versions"\)/,
  'Buyer portal code must not query packet versions directly to classify a download.',
)

const buyerPacketSummary = between(
  clientApi,
  'async function resolveClientPortalPacketSummary',
  'async function resolveClientPortalOtpPacketSummary',
)
assert.doesNotMatch(
  buyerPacketSummary,
  /final_signed_file_path|final_signed_file_bucket|final_signed_file_name/,
  'Buyer packet summaries must not fetch final-artifact coordinates into the browser.',
)
assert.match(
  buyerPacketSummary,
  /resolveClientPortalFinalSignedArtifactAccess\(\{[\s\S]*?packetId: resolvedPacket\.id,[\s\S]*?packetVersionId: version\.id/,
  'Buyer packet finalisation state must come from the trusted resolver.',
)
const buyerSafeDocumentRows = between(
  clientApi,
  'async function fetchClientPortalSafeSharedDocumentRowsByTransactionIds',
  'async function loadSharedDocuments',
)
const buyerFinalDescriptorProjection = between(
  buyerSafeDocumentRows,
  'const finalDescriptorSelectCandidates = [',
  'let normalRows = null',
)
assert.doesNotMatch(
  buyerFinalDescriptorProjection,
  /file_path|file_bucket|bucket_key|file_url|storage_path|url/,
  'Buyer final Documents rows must be selected without any storage transport field.',
)
assert.match(
  buyerSafeDocumentRows,
  /\.or\('stage_key\.is\.null,stage_key\.neq\.final_signed'\)[\s\S]*?\.eq\('stage_key', 'final_signed'\)/,
  'Buyer portal must fetch normal and final document rows through separate server-side stage filters.',
)
const buyerSharedDocumentLoader = between(
  clientApi,
  'async function loadSharedDocuments',
  'async function attemptPromotePendingSellerDocumentsIfPossible',
)
assert.match(
  buyerSharedDocumentLoader,
  /clientPortalFinalArtifactDescriptors[\s\S]*?fetchClientPortalSafeSharedDocumentRowsByTransactionIds/,
  'Client Documents Centre must use the no-path final-document query rather than post-fetch masking alone.',
)

const syntheticSellerDocument = between(
  sellerApi,
  'function buildSignedMandateDocumentFromPacketForListing',
  'function isCanonicalFinalSignedMandateDocument',
)
assert.match(syntheticSellerDocument, /canonicalFinalArtifact: true/)
assert.match(syntheticSellerDocument, /packet_id: packetId/)
assert.doesNotMatch(
  syntheticSellerDocument,
  /storage_path:|file_path:|file_url:|fileUrl:|signedUrl:|url:/,
  'The synthetic seller mandate must be a packet descriptor, not a raw storage record.',
)
assert.match(
  sellerApi,
  /canonicalFinalArtifact: true[\s\S]*?createSellerClientPortalDocumentSignedUrl[\s\S]*?The final signed mandate must be opened through its secure completion record/,
  'Generic seller downloads must reject canonical final packet artifacts.',
)
assert.match(
  sellerApi,
  /sanitizeSellerPortalMandatePacket[\s\S]*?stripFinalSignedArtifactTransportFields[\s\S]*?mapSellerClientPortalPayload/,
  'Seller portal payload mapping must strip raw final-artifact transport fields.',
)
assert.match(
  sellerApi,
  /mandateSignedDocumentPath[\s\S]*?mandate_signed_document_url[\s\S]*?function stripFinalSignedArtifactTransportFields/,
  'Seller browser fallback sanitization must also remove legacy mandate document aliases.',
)
assert.match(
  sellerApi,
  /if \(options\?\.requirePortalAccess === true\) \{[\s\S]*?secure seller portal is temporarily unavailable[\s\S]*?const rawListing = await getPrivateListingById[\s\S]*?sanitizeSellerPortalListingFinalArtifacts\(rawListing, rawMandatePacket\)/,
  'Seller portal fallback must fail closed rather than return an unverified raw listing payload.',
)
assert.match(
  sellerWorkspace,
  /canonicalFinalArtifact: true[\s\S]*?packet_id: packetId[\s\S]*?packet_version_id: versionId/,
  'Seller workspace must route final copies by packet/version descriptor.',
)
assert.match(
  sellerWorkspace,
  /packetPayload\.finalSignedRecorded === true[\s\S]*?version\.final_signed_document_id/,
  'Seller workspace must preserve the server-safe final-artifact state without needing a raw path.',
)
assert.match(
  sellerApi,
  /function mandatePacketHasFinalSignedArtifact[\s\S]*?mandatePacket\?\.finalSignedRecorded === true[\s\S]*?final_signed_document_id/,
  'Seller legacy mapping must retain a server-issued final descriptor after raw fields are removed.',
)
assert.match(
  sellerApi,
  /function sanitizeSellerPortalMandatePacket[\s\S]*?mandatePacket\.finalSignedRecorded === true[\s\S]*?finalSignedRecorded,\n  \}/,
  'Client-side seller payload sanitization must preserve the server-safe final-state flag.',
)
const normalizedSellerDocuments = between(sellerApi, 'function normalizeDocumentRows', 'function stripUnsupportedTaxonomyColumns')
assert.match(
  normalizedSellerDocuments,
  /canonicalFinalArtifact: row\?\.canonicalFinalArtifact === true[\s\S]*?packet_version_id:[\s\S]*?finalDocumentId:/,
  'Seller document normalization must retain resolver descriptor identities.',
)

for (const token of [
  'bridge_private_listing_seller_portal_payload_phase1',
  'bridge_sanitize_seller_portal_final_artifact_payload_phase4',
  'bridge_is_seller_portal_final_artifact_document_phase4',
  'bridge_strip_seller_portal_final_artifact_fields_phase4',
  'bridge_strip_seller_portal_final_artifact_values_phase4',
  'finalSignedRecorded',
  'finalSignedDocumentId',
  'canonicalFinalArtifact',
  'final_signed_document_id',
]) {
  assert.ok(sellerPortalFenceMigration.includes(token), `Seller RPC fence must retain ${token}.`)
}
assert.match(
  sellerPortalFenceMigration,
  /revoke all on function public\.bridge_private_listing_seller_portal_payload_phase1\(text, text, boolean\)[\s\S]*?from public, anon, authenticated, service_role/,
  'The raw Phase 1 seller payload implementation must not be browser-callable.',
)
const recursiveSellerArtifactStripper = between(
  sellerPortalFenceMigration,
  'create or replace function public.bridge_strip_seller_portal_final_artifact_fields_phase4',
  'create or replace function public.bridge_sanitize_seller_portal_final_artifact_payload_phase4',
)
for (const alias of [
  'finalsignedfilepath',
  'final_signed_file_path',
  'finalsignedfilebucket',
  'final_signed_file_bucket',
  'finalsignedfileurl',
  'final_signed_file_url',
  'generatedpreviewfilepath',
  'generated_preview_file_path',
  'generatedpreviewfilebucket',
  'generated_preview_file_bucket',
  'generatedpreviewfileurl',
  'generated_preview_file_url',
  'renderedfilepath',
  'rendered_file_path',
  'renderedfilebucket',
  'rendered_file_bucket',
  'renderedfileurl',
  'rendered_file_url',
  'mandatesigneddocumentpath',
  'mandate_signed_document_path',
  'mandatesigneddocumenturl',
  'mandate_signed_document_url',
  'mandatesigneddocumentbucket',
  'mandate_signed_document_bucket',
]) {
  assert.ok(recursiveSellerArtifactStripper.includes(alias), `Recursive seller payload scrubber must remove ${alias}.`)
}
assert.match(
  sellerPortalFenceMigration,
  /v_final_recorded :=[\s\S]*?v_payload := public\.bridge_strip_seller_portal_final_artifact_fields_phase4\(v_payload\)[\s\S]*?v_payload := public\.bridge_strip_seller_portal_final_artifact_values_phase4\([\s\S]*?v_safe_packet :=/,
  'The seller RPC must capture safe descriptor state, then recursively scrub every returned JSON branch and known F2 value before projection.',
)
assert.match(
  sellerPortalFenceMigration,
  /bridge_strip_seller_portal_final_artifact_values_phase4[\s\S]*?position\(p_final_path in coalesce\(item\.value #>> '\{\}', ''\)\) > 0[\s\S]*?position\(p_final_url in coalesce\(item\.value #>> '\{\}', ''\)\) > 0/,
  'Recursive seller sanitization must remove arbitrary nested values containing an F2 path or URL.',
)
const safeSellerVersionSql = between(
  sellerPortalFenceMigration,
  'v_safe_version := jsonb_strip_nulls(jsonb_build_object(',
  'if v_packet_id is not null then',
)
assert.doesNotMatch(
  safeSellerVersionSql,
  /final_signed_file_path|final_signed_file_bucket|final_signed_file_url|final_signed_file_access_url|rendered_file_path/,
  'The server-safe seller version projection must omit every artifact storage coordinate.',
)
const safeSellerPacketSql = between(
  sellerPortalFenceMigration,
  'v_safe_mandate_packet := jsonb_strip_nulls(jsonb_build_object(',
  '));\n  end if;',
)
assert.doesNotMatch(
  safeSellerPacketSql,
  /generatedPreviewFilePath|rendered_file_path|finalSignedFilePath|finalSignedFileBucket|finalSignedFileUrl|finalSignedDownloadUrl/,
  'The seller mandate summary must not expose a preview or final storage path.',
)
assert.match(
  sellerPortalFenceMigration,
  /where not public\.bridge_is_seller_portal_final_artifact_document_phase4[\s\S]*?v_final_document_descriptor := jsonb_strip_nulls[\s\S]*?canonicalFinalArtifact', true[\s\S]*?packet_version_id', v_version_id/,
  'Legacy signed-mandate rows must be replaced with an identity-only descriptor.',
)
const sellerPortalPublicWrapper = between(
  sellerPortalFenceMigration,
  'create or replace function public.bridge_private_listing_seller_portal_payload(',
  "revoke all on function public.bridge_private_listing_seller_portal_payload(text, text, boolean)",
)
assert.match(
  sellerPortalPublicWrapper,
  /bridge_private_listing_seller_portal_payload_phase1[\s\S]*?bridge_sanitize_seller_portal_final_artifact_payload_phase4/,
  'The public seller RPC must sanitize the upstream payload before returning it.',
)
assert.match(
  sellerPortalFenceMigration,
  /notify pgrst, 'reload schema';[\s\S]*?commit;/,
  'The new seller RPC contract must refresh the PostgREST schema cache on deployment.',
)
assert.match(
  sellerPortalStagingVerifier,
  /findSellerFinalArtifactTransportFields[\s\S]*?FINAL_ARTIFACT_TRANSPORT_KEYS[\s\S]*?sellerPayloadFinalArtifactTransportFields/,
  'The staging fixture must recursively reject final-artifact transport fields in the serialized seller RPC response.',
)
assert.match(
  sellerPortalStagingVerifier,
  /document_packet_versions[\s\S]*?final_signed_file_path, final_signed_file_bucket, final_signed_file_url[\s\S]*?serializedSellerPayload\.includes/,
  'When a final seller fixture exists, staging verification must compare every F2 coordinate against the RPC response.',
)
assert.doesNotMatch(
  sellerPortalStagingVerifier,
  /token:\s*portalLinkQuery\.data\.token|path:\s*`\/client\/\$\{portalLinkQuery\.data\.token\}/,
  'The staging verifier must not print a live client-portal token or URL.',
)

const openPortalDocument = between(clientPortal, 'async function handleOpenPortalDocument', '\n  useEffect(() =>')
assert.ok(
  openPortalDocument.indexOf('document?.canonicalFinalArtifact') < openPortalDocument.indexOf('!document?.file_path && !document?.url'),
  'ClientPortal must handle canonical final descriptors before the generic document downloader.',
)
assert.match(
  clientPortal,
  /handleOpenFinalSignedPortalDocument[\s\S]*?resolveSellerClientPortalFinalSignedDocumentAccess[\s\S]*?resolveClientPortalFinalSignedDocumentAccess/,
  'ClientPortal must obtain a fresh server-authorized final URL for either portal type.',
)
assert.match(
  clientPortal,
  /documentId: normalizedDocumentId/,
  'ClientPortal must pass a final Documents-row descriptor to the secure resolver.',
)
assert.match(
  packetApi,
  /Final signed artifacts have a stricter access contract[\s\S]*?final_signed_file_access_url = ''/,
  'Packet hydration must not pre-mint a final signed URL for the workspace.',
)
assert.match(
  legalWorkspace,
  /handleOpenFinalSignedDocument[\s\S]*?resolveWorkspaceFinalSignedDocumentAccess[\s\S]*?download: true/,
  'Legal workspace downloads must go through the Phase 4 resolver.',
)

console.log('Phase 4 final-signed artifact access fence contract passed.')
