import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agencySource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.ok(agencySource.includes('function handleSellerLeadSignedMandateUpload'), 'Seller lead Documents tab should have a dedicated hard-copy signed mandate upload action.')
assert.ok(agencySource.includes('uploadPrivateListingDocument(targetListingId, file'), 'Hard-copy signed mandate should upload into private listing documents.')

console.log('Seller lead mandate signed upload button verified.')

// Execute the adapter with the same physical-upload preview shape returned by
// getPrivateListing. A signed preview URL must never invent packet completion.
const adapterSource = agencySource.slice(agencySource.indexOf('function buildSellerLeadMandatePacketForDocuments('), agencySource.indexOf('function mapSellerLeadDocumentSourceRow('))
const packetForDocuments = new Function('normalizeText', 'normalizeKey', 'firstWorkspaceText', `${adapterSource}; return buildSellerLeadMandatePacketForDocuments`)(
  value => String(value ?? '').trim(),
  value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'),
  (...values) => values.map(value => String(value ?? '').trim()).find(Boolean) || '',
)
for (const status of ['uploaded', 'under_review', 'approved']) {
  assert.equal(packetForDocuments({ listing: { mandateStatus: status, mandate: { finalSignedDownloadUrl: 'https://example.test/private-upload-preview' } } }), null)
}
const actualPacket = packetForDocuments({ mandatePacketStatus: { state: 'completed', packet: { id: 'packet-1' }, versions: [{ id: 'version-1', final_signed_file_path: 'packets/packet-1/final.pdf' }] } })
assert.equal(actualPacket.id, 'packet-1')
assert.equal(actualPacket.version.id, 'version-1')
assert.equal(actualPacket.finalSignedRecorded, true)
console.log('Uploaded mandate previews preserve the real file and review status.')
