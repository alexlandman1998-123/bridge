import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

function createStorageClient(handler) {
  const calls = []
  return {
    calls,
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(path, expiresInSeconds) {
            calls.push({ bucket, path, expiresInSeconds })
            return handler({ bucket, path, expiresInSeconds, callIndex: calls.length - 1 })
          },
        }
      },
    },
  }
}

const expiredSignedUrl =
  'https://project.supabase.co/storage/v1/object/sign/documents/mandates/expired.pdf?token=expired'
const durableUrl = 'https://cdn.example.test/documents/mandates/durable.pdf'

const server = await createServer({
  root,
  logLevel: 'silent',
  appType: 'custom',
  server: { middlewareMode: true },
})

try {
  const {
    isPersistedSupabaseSignedUrl,
    resolveRenderedPdfAccess,
  } = await server.ssrLoadModule('/src/lib/documentPacketsApi.js')

  assert.equal(isPersistedSupabaseSignedUrl(expiredSignedUrl), true)
  assert.equal(isPersistedSupabaseSignedUrl(durableUrl), false)

  const fallbackClient = createStorageClient(({ bucket, path, expiresInSeconds }) => {
    if (bucket === 'missing-bucket') return { data: null, error: { message: 'not found' } }
    return {
      data: { signedUrl: `https://fresh.example.test/${bucket}/${path}?ttl=${expiresInSeconds}` },
      error: null,
    }
  })
  const fallbackAccess = await resolveRenderedPdfAccess({
    client: fallbackClient,
    version: {
      rendered_file_path: 'mandates/packet/version.pdf',
      rendered_file_bucket: 'missing-bucket',
      rendered_file_url: expiredSignedUrl,
    },
    expiresInSeconds: 123,
  })
  assert.equal(fallbackAccess.contract, 'rendered-pdf-access-v1')
  assert.equal(fallbackAccess.source, 'fresh_signed_url')
  assert.equal(fallbackAccess.persistedSignedUrlIgnored, true)
  assert.equal(fallbackAccess.bucket, 'documents')
  assert.equal(fallbackAccess.error, null)
  assert.match(fallbackAccess.accessUrl, /fresh\.example\.test\/documents\/mandates\/packet\/version\.pdf\?ttl=123/)
  assert.deepEqual(
    fallbackClient.calls.map((call) => call.bucket),
    ['missing-bucket', 'documents'],
    'bucket hint must be tried before canonical documents fallback',
  )

  const noPathAccess = await resolveRenderedPdfAccess({
    client: fallbackClient,
    version: {
      rendered_file_url: expiredSignedUrl,
    },
  })
  assert.equal(noPathAccess.accessUrl, '')
  assert.equal(noPathAccess.source, 'unavailable')
  assert.equal(noPathAccess.persistedSignedUrlIgnored, true)
  assert.equal(noPathAccess.error?.code, 'PERSISTED_SIGNED_URL_IGNORED')

  const durableNoPathAccess = await resolveRenderedPdfAccess({
    client: fallbackClient,
    version: {
      rendered_file_url: durableUrl,
    },
  })
  assert.equal(durableNoPathAccess.accessUrl, durableUrl)
  assert.equal(durableNoPathAccess.source, 'durable_url')
  assert.equal(durableNoPathAccess.error, null)

  const allStorageFailsClient = createStorageClient(() => ({ data: null, error: { message: 'storage down' } }))
  const failedSignedAccess = await resolveRenderedPdfAccess({
    client: allStorageFailsClient,
    version: {
      rendered_file_path: 'mandates/packet/fails.pdf',
      rendered_file_bucket: 'documents',
      rendered_file_url: expiredSignedUrl,
    },
  })
  assert.equal(failedSignedAccess.accessUrl, '')
  assert.equal(failedSignedAccess.source, 'unavailable')
  assert.equal(failedSignedAccess.error?.code, 'RENDERED_PDF_SIGNED_URL_CREATE_FAILED')

  const durableFallbackAccess = await resolveRenderedPdfAccess({
    client: allStorageFailsClient,
    version: {
      rendered_file_path: 'mandates/packet/durable-fallback.pdf',
      rendered_file_bucket: 'documents',
      rendered_file_url: durableUrl,
    },
  })
  assert.equal(durableFallbackAccess.accessUrl, durableUrl)
  assert.equal(durableFallbackAccess.source, 'durable_url_fallback')
  assert.equal(durableFallbackAccess.error, null)

  const retryClient = createStorageClient(({ callIndex, bucket, path }) => {
    if (callIndex === 0) return { data: null, error: { message: 'not replicated yet' } }
    return { data: { signedUrl: `https://fresh.example.test/${bucket}/${path}?retry=1` }, error: null }
  })
  const retryAccess = await resolveRenderedPdfAccess({
    client: retryClient,
    version: {
      rendered_file_path: 'mandates/packet/retry.pdf',
      rendered_file_bucket: 'documents',
      rendered_file_url: expiredSignedUrl,
    },
    retrySignedUrl: true,
    retryDelaysMs: [1],
  })
  assert.equal(retryAccess.source, 'fresh_signed_url')
  assert.match(retryAccess.accessUrl, /retry=1/)
  assert.equal(retryClient.calls.length, 2)

  console.log('Rendered PDF access runtime regressions passed.')
} finally {
  await server.close()
}
