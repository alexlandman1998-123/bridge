import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    DOCUMENT_UPLOAD_STAGES,
    createDocumentUploadProgress,
    runDocumentUploadWithLifecycle,
  } = await server.ssrLoadModule('/src/lib/documentUploadLifecycle.js')

  const saving = createDocumentUploadProgress(DOCUMENT_UPLOAD_STAGES.saving)
  assert.equal(saving.busy, true)
  assert.equal(saving.terminal, false)
  assert.match(saving.message, /Saving the document record/)

  const unknown = createDocumentUploadProgress('not-a-stage')
  assert.equal(unknown.stage, DOCUMENT_UPLOAD_STAGES.failed)
  assert.equal(unknown.terminal, true)

  const events = []
  const result = await runDocumentUploadWithLifecycle({
    upload: async ({ onProgress }) => {
      onProgress(DOCUMENT_UPLOAD_STAGES.preparing, 'Preparing…')
      onProgress(DOCUMENT_UPLOAD_STAGES.uploading, 'Uploading…')
      return { id: 'document-1', postUploadProcessing: 'queued' }
    },
    onProgress: (event) => events.push(event),
  })
  assert.equal(result.id, 'document-1')
  assert.deepEqual(events.map((event) => event.stage), ['preparing', 'uploading', 'complete'])
  assert.equal(events.at(-1).postUploadProcessing, 'queued')

  await assert.rejects(
    () => runDocumentUploadWithLifecycle({ upload: async () => { throw new Error('Storage unavailable') }, onProgress: (event) => events.push(event) }),
    /Storage unavailable/,
  )
  assert.equal(events.at(-1).stage, 'failed')
  console.log('document upload lifecycle contract tests passed')
} finally {
  await server.close()
}
