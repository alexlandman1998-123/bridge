import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const bundleDir = await mkdtemp(path.join(tmpdir(), 'seller-post-mandate-portal-'))
const entryPath = path.join(bundleDir, 'entry.mjs')
const bundlePath = path.join(bundleDir, 'bundle.mjs')
const servicePath = path.join(process.cwd(), 'src/services/clientPortalWorkspaceService.js')

await writeFile(
  entryPath,
  `export { buildDocumentCenter, resolveSellerPortalRequiredDocumentPack } from ${JSON.stringify(servicePath)}\n`,
)

await build({
  entryPoints: [entryPath],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'esm',
  define: {
    'import.meta.env': '{}',
  },
  logLevel: 'silent',
})

const { buildDocumentCenter, resolveSellerPortalRequiredDocumentPack } = await import(pathToFileURL(bundlePath).href)

const portalData = {
  listing: {
    id: 'listing-company-portal',
    propertyAddress: '409 Queens Cres, Menlo Park',
    mandateStatus: 'signed',
    sellerOnboarding: {
      status: 'completed',
      formData: {
        email: 'company-seller@example.com',
        firstName: 'Casey',
        lastName: 'Director',
        identityNumber: '8001015009087',
        ownershipType: 'company',
        companyName: 'Example Property Pty Ltd',
        companyRegistrationNumber: '2020/123456/07',
        companyRegisteredAddress: '1 Example Road',
        authorisedSignatoryName: 'Casey Director',
        propertyDisclosure: {
          decision: 'none',
          declarationAccepted: true,
          signature: 'Casey Director',
          signedAt: '2026-07-20T08:00:00.000Z',
          signedPlace: 'Pretoria',
          responses: {},
        },
      },
    },
  },
  activeSellingContext: {
    mandatePacket: {
      id: 'packet-company-portal',
      status: 'fully_signed',
      finalSignedAccess: {
        available: true,
        finalArtifact: { fileName: 'Signed Mandate.pdf' },
      },
    },
  },
  requiredDocuments: [
    {
      id: 'stale-individual-id',
      requirement_key: 'id_document',
      requirement_name: 'ID Document',
      document_visibility: 'seller_visible',
      status: 'required',
      is_required: true,
    },
    {
      id: 'persisted-resolution-id',
      requirement_key: 'company_resolution_to_sell',
      requirement_name: 'Company Resolution',
      document_visibility: 'seller_visible',
      status: 'requested',
      is_required: true,
    },
    {
      id: 'signed-mandate-id',
      requirement_key: 'signed_mandate',
      requirement_name: 'Signed Mandate',
      document_visibility: 'seller_visible',
      status: 'required',
      is_required: true,
    },
  ],
  documents: [
    {
      id: 'uploaded-resolution',
      requirementKey: 'company_resolution_to_sell',
      document_type: 'company_resolution_to_sell',
      document_name: 'Company Resolution.pdf',
      status: 'uploaded',
      visibility: 'seller_visible',
    },
  ],
}

const pack = resolveSellerPortalRequiredDocumentPack(portalData, 'selling')
const packKeys = pack.requiredDocuments.map((item) => item.key)

assert.equal(pack.source, 'seller_onboarding_structure')
assert.equal(pack.sellerStructure.sellerType, 'company')
assert.equal(pack.mandateSigned, true)
assert.ok(pack.documentPackFingerprint, 'portal pack should expose a stable fingerprint for diagnostics')
assert.ok(packKeys.includes('company_resolution_to_sell'), 'company authority document should remain in the portal upload pack')
assert.ok(packKeys.includes('director_member_ids'), 'company director/member FICA should be derived for the portal')
assert.equal(packKeys.includes('id_document'), false, 'stale individual-only requirements must not be shown to company sellers')
assert.equal(packKeys.includes('signed_mandate'), false, 'signed mandate must not be requested as a seller upload after completion')

const documentCenter = buildDocumentCenter(portalData, 'selling')
const requiredKeys = documentCenter.requiredDocuments.map((item) => item.key)
const itemKeys = documentCenter.items.map((item) => item.sourceId)
const resolutionItem = documentCenter.items.find((item) => item.sourceId === 'company_resolution_to_sell')
const disclosureItem = documentCenter.items.find((item) => item.sourceId === 'property_condition_disclosure')
const signedMandate = documentCenter.uploadedDocuments.find((item) => item.canonicalFinalArtifact)

assert.deepEqual(requiredKeys, packKeys)
assert.equal(documentCenter.sellerStructure.sellerType, 'company')
assert.equal(documentCenter.documentPackSource, 'seller_onboarding_structure')
assert.equal(documentCenter.documentPackFingerprint, pack.documentPackFingerprint)
assert.equal(itemKeys.includes('id_document'), false)
assert.equal(itemKeys.includes('signed_mandate'), false)
assert.equal(resolutionItem.status, 'uploaded')
assert.equal(resolutionItem.uploadSpec.type, 'requirement')
assert.equal(disclosureItem.status, 'completed')
assert.equal(disclosureItem.uploadSpec, null)
assert.equal(disclosureItem.openLabel, 'Download Property Disclosure')
assert.equal(disclosureItem.linkedDocument.systemGeneratedDocument, true)
assert.match(disclosureItem.linkedDocument.generatedHtml, /Declaration by Seller - Annexure A/)
assert.equal(signedMandate.name, 'Signed Mandate.pdf')

console.log('seller post-mandate document portal behavior tests passed')
