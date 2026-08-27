import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('production adapts live document-centre items without moving action plumbing', async () => {
  const source = await read('src/pages/ClientPortal.jsx')

  assert.match(source, /buildBuyerDocumentPresentationModel\(\{[\s\S]*?items: buyerMobileDocumentItems,[\s\S]*?source: 'production'/)
  assert.match(source, /<BuyerDocumentWorkspace[\s\S]*?model=\{buyerDocumentPresentationModel\}[\s\S]*?onUpload=\{handleDocumentCentreUpload\}[\s\S]*?onOpenDocument=\{handleOpenPortalDocument\}/)
  assert.match(source, /effectiveWorkspace === 'seller' \? \([\s\S]*?<ClientDocumentCentre/)
  assert.match(source, /<BuyerDocumentSummary[\s\S]*?model=\{documentModel\}/)
})
test('demo overview and documents route share one reactive fixture model', async () => {
  const source = await read('src/pages/ProspectBuyerDemo.jsx')

  assert.match(source, /const buyerDocumentModel = useMemo\(/)
  assert.match(source, /items: buildDemoBuyerDocumentItems\(demoUploadComplete\)/)
  assert.match(source, /documentModel=\{buyerDocumentModel\}/)
  assert.match(source, /<BuyerDocumentSummary[\s\S]*?model=\{documentModel\}/)
  assert.match(source, /<BuyerDocumentWorkspace[\s\S]*?model=\{documentModel\}/)
})

test('shared buyer document files remain presentation-only boundaries', async () => {
  const [model, workspace] = await Promise.all([
    read('src/core/clientPortal/buyerDocumentPresentationModel.js'),
    read('src/components/client-portal/documents/BuyerDocumentWorkspace.jsx'),
  ])

  assert.doesNotMatch(model, /services\/|supabase|fetch\(|localStorage|sessionStorage/)
  assert.doesNotMatch(workspace, /services\/|supabase|DEMO_DOCUMENT|workspaceData/)
  assert.match(workspace, /data-buyer-documents="summary"/)
  assert.match(workspace, /data-buyer-documents="workspace"/)
  assert.match(workspace, /data-document-status=\{item\.presentationStatus\}/)
})
