import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const server = await createServer({
  root: appRoot,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const documents = await server.ssrLoadModule('/src/domains/documents/api.js')
  const legacy = await server.ssrLoadModule('/src/lib/api.js')
  assert.equal(legacy.generateOtpDocumentFromTemplate, documents.generateOtpDocumentFromTemplate)

  await assert.rejects(
    () => documents.generateOtpDocumentFromTemplate(),
    (error) => error.message === 'Transaction is required.',
  )
  await assert.rejects(
    () => legacy.generateOtpDocumentFromTemplate({ transactionId: 'tx-1' }),
    (error) => error.code === 'OTP_LEGACY_RENDERER_RETIRED'
      && error.requiredAction === 'CREATE_OR_REISSUE_CANONICAL_OTP_PDF',
  )

  console.log('API-split Phase 4 document contract tests passed.')
} finally {
  await server.close()
}
