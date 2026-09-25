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

