import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

test('seller document centre excludes internal and professional-shared documents before rendering', async () => {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const { buildDocumentCenter } = await server.ssrLoadModule('/src/services/clientPortalWorkspaceService.js')
    const documentCenter = buildDocumentCenter({
      requiredDocuments: [{
        id: 'requirement-1',
        key: 'identity',
        label: 'Identity document',
        applies_to: 'seller',
        visibility: 'seller_visible',
        status: 'required',
      }],
      documents: [
        { id: 'seller-file', name: 'Identity.pdf', requirement_id: 'requirement-1', visibility: 'seller_visible' },
        { id: 'internal-file', name: 'Risk note.pdf', visibility: 'internal_only' },
        { id: 'professional-file', name: 'Attorney instruction.pdf', visibility: 'shared_role_players' },
      ],
    }, 'selling')

    assert.equal(documentCenter.uploadedDocuments.some((item) => item.id === 'seller-file'), true)
    assert.equal(documentCenter.uploadedDocuments.some((item) => item.id === 'internal-file'), false)
    assert.equal(documentCenter.uploadedDocuments.some((item) => item.id === 'professional-file'), false)
  } finally {
    await server.close()
  }
})

test('buyer document centre keeps legacy unclassified documents unchanged', async () => {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const { buildDocumentCenter } = await server.ssrLoadModule('/src/services/clientPortalWorkspaceService.js')
    const documentCenter = buildDocumentCenter({
      documents: [{ id: 'legacy-buyer-file', name: 'Legacy buyer document.pdf' }],
    }, 'buying')

    assert.equal(documentCenter.uploadedDocuments.some((item) => item.id === 'legacy-buyer-file'), true)
  } finally {
    await server.close()
  }
})

test('agent-uploaded seller evidence reaches both the lead projection and seller portal', async () => {
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const { buildDocumentCenter } = await server.ssrLoadModule('/src/services/clientPortalWorkspaceService.js')
    const { buildSellerDocumentSourceOfTruth } = await server.ssrLoadModule('/src/services/sellerDocumentRequirementsService.js')
    const requirement = {
      id: 'seller-disclosure-requirement',
      key: 'signed_disclosure_form',
      requirement_key: 'signed_disclosure_form',
      label: 'Signed Mandatory Disclosure / Defects Form',
      applies_to: 'seller',
      visibility: 'seller_visible',
      status: 'uploaded',
      is_required: true,
      group: 'legal',
    }
    const document = {
      id: 'agent-uploaded-disclosure',
      requirement_id: requirement.id,
      document_type: 'signed_disclosure_form',
      document_name: 'Disclosure.pdf',
      storage_path: 'private-listings/listing-1/documents/disclosure.pdf',
      status: 'uploaded',
      visibility: 'seller_visible',
    }
    const listing = { id: 'listing-1', documentRequirements: [requirement], documents: [document] }
    const leadView = buildSellerDocumentSourceOfTruth({ listing })
    const portalView = buildDocumentCenter({ listing, requiredDocuments: [requirement], documents: [document] }, 'selling')

    assert.equal(leadView.rows.some((row) => row.key === 'signed_disclosure_form' && row.hasUpload), true)
    assert.equal(portalView.uploadedDocuments.some((row) => row.id === document.id), true)
    assert.equal(portalView.requiredDocuments.some((row) => row.key === requirement.key && row.isUploaded), true)
  } finally {
    await server.close()
  }
})
