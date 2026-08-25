import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const serviceSource = readFileSync(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const listingDetailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')

assert.match(
  serviceSource,
  /export async function uploadPrivateListingDocument\(listingId, file, \{\s*requirementId = '',\s*requirementKey = '',/s,
  'agent-side seller document uploads must accept explicit requirement identity',
)

assert.match(
  listingDetailSource,
  /uploadPrivateListingDocument\(listingRecord\.id, file, \{\s*requirementId: doc\.id \|\| doc\.requirementId \|\| doc\.requirement_id \|\| '',\s*requirementKey: doc\.key \|\| doc\.requirementKey \|\| doc\.requirement_key \|\| '',/s,
  'listing detail uploads must pass the selected Seller Pack requirement identity',
)

assert.match(
  serviceSource,
  /const requirements = await getPrivateListingDocumentRequirements\(normalizedListingId\)\.catch\(\(\) => \[\]\)/,
  'agent uploads must load listing requirements before inserting the document row',
)

assert.match(
  serviceSource,
  /requirement_id: matchedRequirement\?\.id \|\| normalizedRequirementId \|\| null/,
  'uploaded physical documents must be linked to their private_listing_document_requirements row',
)

assert.match(
  serviceSource,
  /await updatePrivateListingRequirementStatus\(linkedRequirementId, uploadedStatus === 'completed' \? 'completed' : 'uploaded'\)/,
  'uploading a physical pack document must move the checklist item to uploaded',
)

assert.match(
  serviceSource,
  /await updatePrivateListing\(normalizedListingId, \{\s*listingStatus: 'mandate_signed',\s*listingVisibility: 'internal',\s*isActive: false,\s*mandateStatus: 'signed_uploaded',\s*\}, \{ includeRequirementsAndDocuments: false \}\)/s,
  'wet-signed mandate uploads must keep the listing internal while marking the mandate as signed_uploaded',
)

assert.match(
  serviceSource,
  /source: mandateUpload \? 'physical_signed_mandate_upload' : 'quick_add'/,
  'physical mandate uploads must be auditable in listing activity metadata',
)

console.log('kingstons physical seller pack upload tests passed')
