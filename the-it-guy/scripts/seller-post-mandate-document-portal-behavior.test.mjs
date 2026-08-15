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
assert.ok(packKeys.includes('cipc_documents'), 'raw company pack should still derive CIPC document evidence')
assert.ok(packKeys.includes('authorised_signatory_id'), 'raw company pack should still derive authorised signatory ID evidence')
assert.ok(packKeys.includes('company_address_proof'), 'raw company pack should still derive registered-address evidence')
assert.equal(packKeys.includes('id_document'), false, 'stale individual-only requirements must not be shown to company sellers')
assert.equal(packKeys.includes('signed_mandate'), false, 'signed mandate must not be requested as a seller upload after completion')

const documentCenter = buildDocumentCenter(portalData, 'selling')
const requiredKeys = documentCenter.requiredDocuments.map((item) => item.key)
const itemKeys = documentCenter.items.map((item) => item.sourceId)
const resolutionItem = documentCenter.items.find((item) => item.sourceId === 'company_resolution_to_sell')
const disclosureItem = documentCenter.items.find((item) => item.sourceId === 'signed_disclosure_form')
const ficaDeclarationItem = documentCenter.items.find((item) => item.sourceId === 'signed_fica_declaration')
const signedMandate = documentCenter.uploadedDocuments.find((item) => item.canonicalFinalArtifact)

assert.equal(documentCenter.sellerStructure.sellerType, 'company')
assert.equal(documentCenter.documentPackSource, 'seller_onboarding_structure')
assert.equal(documentCenter.documentPackFingerprint, pack.documentPackFingerprint)
assert.equal(itemKeys.includes('id_document'), false)
assert.equal(itemKeys.includes('signed_mandate'), false)
assert.ok(requiredKeys.includes('company_registration'), 'document centre should keep the canonical company registration row')
assert.ok(requiredKeys.includes('company_resolution_to_sell'), 'document centre should keep the company resolution upload row')
assert.ok(requiredKeys.includes('director_member_ids'), 'document centre should keep director/member FICA upload row')
assert.ok(requiredKeys.includes('signed_disclosure_form'), 'document centre should show the standard disclosure upload/completion row')
assert.ok(requiredKeys.includes('signed_fica_declaration'), 'document centre should show the standard FICA declaration row')
for (const duplicateCompanyKey of ['cipc_documents', 'authorised_signatory_id', 'company_address_proof']) {
  assert.equal(
    requiredKeys.includes(duplicateCompanyKey),
    false,
    `${duplicateCompanyKey} should be represented by the canonical company document rows instead of a duplicate portal card`,
  )
}
assert.equal(resolutionItem.status, 'uploaded')
assert.equal(resolutionItem.uploadSpec.type, 'requirement')
assert.equal(disclosureItem.status, 'completed')
assert.equal(disclosureItem.uploadSpec, null)
assert.equal(disclosureItem.openLabel, 'Download Property Disclosure')
assert.equal(disclosureItem.linkedDocument.systemGeneratedDocument, true)
assert.match(disclosureItem.linkedDocument.generatedHtml, /Declaration by Seller - Annexure A/)
assert.equal(ficaDeclarationItem.status, 'completed')
assert.equal(ficaDeclarationItem.uploadSpec, null)
assert.equal(ficaDeclarationItem.linkedDocument.source, 'seller_onboarding.fica_declaration')
assert.equal(ficaDeclarationItem.linkedDocument.completionRoute, 'seller_onboarding_link_completed')
assert.equal(ficaDeclarationItem.linkedDocument.supportingFicaDocumentsDynamic, true)
assert.equal(signedMandate.name, 'Signed Mandate.pdf')

console.log('seller post-mandate document portal behavior tests passed')
