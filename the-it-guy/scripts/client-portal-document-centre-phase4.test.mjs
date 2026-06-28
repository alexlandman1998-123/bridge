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

console.log('client portal document centre phase 4 tests passed')
