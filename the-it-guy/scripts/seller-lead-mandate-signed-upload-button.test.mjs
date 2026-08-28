import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agencySource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const crmRepositorySource = await readFile(new URL('../src/lib/agencyCrmRepository.js', import.meta.url), 'utf8')

assert.ok(agencySource.includes('Upload Signed Mandate'), 'Seller lead actions should expose a hard-copy signed mandate upload path.')
assert.ok(agencySource.includes('function handleSellerLeadSignedMandateUpload'), 'Seller lead Documents tab should have a dedicated hard-copy signed mandate upload action.')
assert.ok(agencySource.includes("handleSellerJourneyAction('record_hard_copy_mandate')"), 'Hard-copy mandate action should route into seller journey handling.')
assert.ok(agencySource.includes('uploadPrivateListingDocument(targetListingId, file'), 'Hard-copy signed mandate should upload into private listing documents.')
assert.ok(agencySource.includes('data-seller-document-key={basePackDocumentKey || documentKey}'), 'Documents tab should expose a stable Signed Mandate scroll/upload target.')
assert.ok(agencySource.includes("activityType: 'Mandate Signed'"), 'Hard-copy signed mandate upload should create a lead activity audit row.')
assert.ok(agencySource.includes('const sellerLeadMandateUploadInputRef = useRef(null)'), 'Seller lead workspace should keep a persistent signed-mandate upload input.')
assert.match(
  agencySource,
  /documents: Array\.isArray\(listing\?\.documents\) \? listing\.documents : \[\],[\s\S]{0,220}?documentRequirements:/,
  'Linked listing options should preserve hydrated document arrays for seller lead document rendering.',
)
assert.match(
  agencySource,
  /ref=\{sellerLeadMandateUploadInputRef\}[\s\S]{0,320}?aria-label="Upload signed mandate"[\s\S]{0,320}?handleSellerLeadSignedMandateUpload\(event\)/,
  'The persistent mandate input should use the existing signed-mandate upload workflow.',
)

const journeyActionSource = agencySource.slice(
  agencySource.indexOf('function handleSellerJourneyAction'),
  agencySource.indexOf('function handleCalendarShift'),
)
const mandateActionSource = journeyActionSource.slice(
  journeyActionSource.indexOf("if (id === 'record_hard_copy_mandate'"),
  journeyActionSource.indexOf("if (id === 'create_listing')"),
)
assert.match(mandateActionSource, /sellerLeadMandateUploadInputRef\.current\?\.click\?\.\(\)/, 'Next Best Action should open the signed-mandate file picker directly.')
assert.doesNotMatch(mandateActionSource, /handleLeadWorkspaceTabSelection\('documents'\)/, 'Signed-mandate upload must not redirect to the Documents tab.')
assert.doesNotMatch(mandateActionSource, /handleCreateListingFromSellerLead/, 'Draft creation should occur after file selection inside the upload handler, preserving the browser file-picker gesture.')

const signedMandateUploadSource = agencySource.slice(
  agencySource.indexOf('async function handleSellerLeadSignedMandateUpload'),
  agencySource.indexOf('async function handleSellerLeadDocumentUpload'),
)
assert.match(
  signedMandateUploadSource,
  /documentName: mandateDocumentLabel \|\| 'Signed Mandate'/,
  'Signed mandate uploads should persist with the canonical mandate document name instead of depending on the uploaded file name.',
)
assert.match(
  signedMandateUploadSource,
  /uploadPrivateListingDocument\(targetListingId, file, \{[\s\S]*?requirementKey: SELLER_BASE_PACK_KEYS\.SIGNED_MANDATE,[\s\S]*?status: 'completed'/,
  'Signed hard-copy mandate uploads should persist as completed evidence, not as a generic uploaded document awaiting review.',
)
assert.match(
  signedMandateUploadSource,
  /status: 'completed',[\s\S]*?statusLabel: 'Completed'/,
  'The seller lead document mirror should render an uploaded signed mandate as completed.',
)
assert.match(
  signedMandateUploadSource,
  /sellerDocuments: nextSellerDocuments,[\s\S]*?seller_uploaded_documents: nextSellerDocuments/,
  'Signed mandate uploads should mirror the uploaded document onto the seller lead payload for refresh-safe rendering.',
)
assert.match(
  signedMandateUploadSource,
  /archiveStatus: 'converted',[\s\S]*?archivedAt: uploadedAt,[\s\S]*?convertedListingId: targetListingId/,
  'Signed mandate uploads should persist archive/conversion metadata onto the seller lead payload.',
)
assert.match(
  signedMandateUploadSource,
  /const leadPatch = \{[\s\S]*?stage: 'Archived',[\s\S]*?status: 'Converted',/,
  'Signed mandate uploads should move the seller lead to Archived with a Converted status.',
)
assert.match(
  signedMandateUploadSource,
  /activityType: 'Seller Lead Converted'[\s\S]*?outcome: 'Converted'/,
  'Signed mandate uploads should write a conversion activity audit row.',
)
assert.match(
  signedMandateUploadSource,
  /await activateSellerPortalForListing\(\{[\s\S]*?listingId: targetListingId,[\s\S]*?activationSource: SELLER_PORTAL_ACTIVATION_SOURCES\.existingListing,[\s\S]*?sellerContactEmail: sellerEmail,/,
  'Signed mandate uploads should automatically send the Seller Portal invitation through the shared activation email path.',
)
assert.match(
  signedMandateUploadSource,
  /activityType: 'Seller Portal Link Sent'[\s\S]*?after signed mandate upload/,
  'Automatic post-mandate portal sends should write a seller lead activity row.',
)
assert.match(
  signedMandateUploadSource,
  /setError\(`Signed mandate uploaded, but Seller Portal link needs attention\./,
  'A failed automatic portal send should not roll back the signed mandate upload and should surface a clear follow-up error.',
)
assert.match(
  signedMandateUploadSource,
  /setAppointmentListingOptions\(\(previous\) => \(Array\.isArray\(previous\) \? previous\.map\(patchListingDocumentMirror\) : previous\)\)/,
  'Signed mandate uploads should patch the linked listing option document array immediately.',
)

assert.match(
  agencySource,
  /function isArchivedLead\(row = \{\}\) \{[\s\S]*?rawPayload\.archiveStatus[\s\S]*?\['archived', 'deleted', 'closed_lost', 'converted'\]/,
  'Archived seller lead filtering should treat converted mandate-upload leads as archived after reload.',
)
assert.match(
  agencySource,
  /function resolveArchivedLeadLabel\(row = \{\}\)/,
  'Archived lead rows should resolve a human-readable Converted label.',
)
assert.match(
  crmRepositorySource,
  /archiveStatus: normalizeText\(rawPayloadObject\.archiveStatus \|\| rawPayloadObject\.archive_status\)/,
  'CRM lead reloads should hydrate archive status from raw_enquiry_payload.',
)
assert.match(
  crmRepositorySource,
  /convertedListingId: normalizeText\(rawPayloadObject\.convertedListingId \|\| rawPayloadObject\.converted_listing_id\)/,
  'CRM lead reloads should hydrate the converted listing id from raw_enquiry_payload.',
)

console.log('Seller lead mandate signed upload button verified.')
