import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const bundleDir = await mkdtemp(path.join(tmpdir(), 'client-portal-document-centre-'))
const entryPath = path.join(bundleDir, 'entry.mjs')
const bundlePath = path.join(bundleDir, 'bundle.mjs')
const servicePath = path.join(process.cwd(), 'src/services/clientPortalWorkspaceService.js')

await writeFile(
  entryPath,
  `export { buildDocumentCenter } from ${JSON.stringify(servicePath)}\n`,
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

const { buildDocumentCenter } = await import(pathToFileURL(bundlePath).href)

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('builds typed items for required documents with reupload state', () => {
  const model = buildDocumentCenter({
    requiredDocuments: [
      {
        key: 'buyer_id',
        label: 'Buyer ID',
        status: 'reupload_required',
        rejectionReason: 'Image is blurry.',
        expectedFromRole: 'buyer',
      },
    ],
    documents: [],
    additionalDocumentRequests: [],
  }, 'buying')

  const item = model.items.find((entry) => entry.sourceId === 'buyer_id')
  assert.equal(item.status, 'rejected')
  assert.equal(item.rejectionReason, 'Image is blurry.')
  assert.deepEqual(item.uploadSpec, { type: 'requirement', requirementKey: 'buyer_id' })
  assert.equal(model.summary.rejected, 1)
  assert.equal(model.summary.blocking, 1)
})

test('buyer additional requests are visible by default and link uploaded documents', () => {
  const model = buildDocumentCenter({
    requiredDocuments: [],
    additionalDocumentRequests: [
      {
        id: 'request-1',
        title: 'Updated Payslip',
        status: 'requested',
        visibility: 'client_visible',
      },
    ],
    documents: [
      {
        id: 'doc-1',
        document_name: 'Updated Payslip',
        document_type: 'Updated Payslip',
        status: 'uploaded',
        visibility: 'client',
      },
    ],
  }, 'buying')

  const item = model.items.find((entry) => entry.sourceType === 'additional_request')
  assert.equal(Boolean(item), true)
  assert.equal(item.status, 'uploaded')
  assert.equal(item.hasUploadedDocument, true)
  assert.equal(item.linkedDocument.id, 'doc-1')
  assert.equal(model.summary.uploaded, 1)
})

test('additional requests without buyer audience do not leak to seller workspace', () => {
  const model = buildDocumentCenter({
    additionalDocumentRequests: [
      {
        id: 'request-1',
        title: 'Updated Payslip',
        status: 'requested',
        visibility: 'client_visible',
      },
    ],
  }, 'selling')

  assert.equal(model.additionalRequests.length, 0)
  assert.equal(model.items.some((item) => item.sourceType === 'additional_request'), false)
})

test('standalone uploads remain visible without duplicating linked uploads', () => {
  const model = buildDocumentCenter({
    requiredDocuments: [
      {
        key: 'proof_of_funds',
        label: 'Proof of Funds',
        status: 'required',
        expectedFromRole: 'buyer',
      },
    ],
    documents: [
      {
        id: 'linked-doc',
        requirementKey: 'proof_of_funds',
        document_name: 'Proof of Funds',
        status: 'approved',
        visibility: 'client',
      },
      {
        id: 'orphan-doc',
        document_name: 'Welcome Letter',
        status: 'uploaded',
        visibility: 'client',
      },
    ],
  }, 'buying')

  assert.equal(model.items.some((item) => item.id === 'uploaded_linked-doc'), false)
  assert.equal(model.items.some((item) => item.id === 'uploaded_orphan-doc'), true)
  const requirement = model.items.find((item) => item.sourceId === 'proof_of_funds')
  assert.equal(requirement.status, 'approved')
  assert.equal(requirement.linkedDocument.id, 'linked-doc')
})

test('seller generated mandate and property disclosure expose the correct downloadable records', () => {
  const model = buildDocumentCenter({
    listing: {
      id: 'listing-sale-documents',
      sellerOnboarding: {
        formData: {
          sellerName: 'Mia Seller',
          propertyDisclosure: {
            declarationAccepted: true,
            generatedDocument: {
              id: 'disclosure-1',
              title: 'Property Condition Disclosure',
              fileName: 'seller-disclosure-annexure-a.html',
              generatedAt: '2026-07-27T08:00:00Z',
            },
          },
        },
      },
    },
    activeSellingContext: {
      mandatePacket: {
        id: 'packet-1',
        state: 'fully_signed',
        packetVersionId: 'version-1',
        finalSignedRecorded: true,
        finalSignedFileName: 'Signed Mandate.pdf',
        version: {
          id: 'version-1',
          final_signed_file_name: 'Signed Mandate.pdf',
        },
      },
    },
    requiredDocuments: [
      {
        id: 'req-defects',
        key: 'defects_declaration',
        label: 'Property Condition Disclosure',
        description: 'Property condition disclosure and known defects.',
        status: 'required',
        visibility: 'seller_visible',
      },
    ],
    documents: [],
    additionalDocumentRequests: [],
  }, 'selling')

  const disclosureSaleDocument = model.saleDocuments.find((item) => item.sourceId === 'seller-declaration-disclosure')
  const signedMandate = model.uploadedDocuments.find((item) => item.canonicalFinalArtifact)
  const generatedDisclosure = model.uploadedDocuments.find((item) => item.requirementKey === 'property_condition_disclosure')
  const completedDisclosureRequirement = model.items.find((item) => item.sourceId === 'property_condition_disclosure')

  assert.equal(Boolean(disclosureSaleDocument), true)
  assert.equal(disclosureSaleDocument.sellerCategoryKey, 'sale')
  assert.equal(generatedDisclosure.generatedFileName, 'seller-disclosure-annexure-a.pdf')
  assert.equal(Boolean(completedDisclosureRequirement), true)
  assert.equal(Boolean(completedDisclosureRequirement.uploadSpec), false)
  assert.equal(completedDisclosureRequirement.downloadableDocument?.generatedFileName, 'seller-disclosure-annexure-a.pdf')
  assert.equal(signedMandate.document_name, 'Signed Mandate.pdf')
  assert.equal(signedMandate.packet_version_id, 'version-1')
  assert.equal(signedMandate.canonicalFinalArtifact, true)
})

test('seller sale documents resolve from production packet status and snake case onboarding payloads', () => {
  const model = buildDocumentCenter({
    listing: {
      id: 'listing-production-shape',
      seller_profile_id: 'seller-production',
      property_profile_id: 'property-production',
    },
    mandatePacketStatus: {
      state: 'fully_signed',
      packet: {
        id: 'packet-production',
        status: 'completed',
        title: 'Exclusive Mandate',
        final_signed_recorded: true,
      },
      versions: [
        {
          id: 'version-production',
          rendered_file_path: 'mandates/generated/exclusive-mandate.pdf',
          rendered_file_name: 'Exclusive Mandate.pdf',
          final_signed_file_name: 'Signed Exclusive Mandate.pdf',
        },
      ],
    },
    onboardingFormData: {
      form_data: {
        sellerFirstName: 'Mia',
        sellerSurname: 'Seller',
        property_disclosure: {
          declaration_accepted: true,
          generated_document: {
            id: 'disclosure-production',
            title: 'Seller Declaration / Disclosure',
            file_name: 'seller-declaration-disclosure.html',
            generated_at: '2026-07-27T08:00:00Z',
          },
        },
      },
    },
    requiredDocuments: [],
    documents: [],
    additionalDocumentRequests: [],
  }, 'selling')

  const saleDocumentTitles = model.saleDocuments.map((item) => item.title)
  const signedMandate = model.uploadedDocuments.find((item) => item.canonicalFinalArtifact)

  assert.deepEqual(saleDocumentTitles, ['Mandate', 'Seller Declaration / Disclosure'])
  assert.equal(model.saleDocuments.every((item) => item.sellerCategoryKey === 'sale'), true)
  assert.equal(signedMandate.document_name, 'Signed Exclusive Mandate.pdf')
  assert.equal(signedMandate.packet_version_id, 'version-production')
})

test('seller sale documents resolve from compact core payload data', () => {
  const model = buildDocumentCenter({
    listing: {
      id: 'listing-core-sales',
      mandate_packet_id: 'packet-core',
    },
    mandatePacket: {
      id: 'packet-core',
      state: 'fully_signed',
      packetVersionId: 'version-core',
      finalSignedRecorded: true,
      packet: {
        id: 'packet-core',
        status: 'completed',
        title: 'Mandate',
      },
      version: {
        id: 'version-core',
        final_signed_file_name: 'Signed Mandate.pdf',
        rendered_file_name: 'Generated Mandate.pdf',
      },
    },
    onboarding: {
      private_listing_id: 'listing-core-sales',
      form_data: {
        propertyDisclosure: {
          declarationAccepted: true,
          generatedDocument: {
            id: 'disclosure-core',
            title: 'Seller Declaration / Disclosure',
            fileName: 'seller-declaration-disclosure.html',
            generatedAt: '2026-07-27T08:00:00Z',
          },
        },
      },
    },
    requiredDocuments: [],
    documents: [],
    additionalDocumentRequests: [],
    corePayload: true,
  }, 'selling')

  assert.deepEqual(model.saleDocuments.map((item) => item.title), ['Mandate', 'Seller Declaration / Disclosure'])
  assert.equal(model.saleDocuments.length, 2)
})

console.log('client portal document centre phase 4 tests passed')
