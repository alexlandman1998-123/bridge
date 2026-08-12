import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    buildKingstonsValuationDownloadEmailPayload,
    isKingstonsValuationPresentationAppointment,
    resolveKingstonsValuationDirectDownloadUrl,
    sendKingstonsValuationDownloadEmailForPresentation,
  } = await server.ssrLoadModule('/src/services/kingstonsValuationDownloadEmailService.js')

  assert.equal(
    isKingstonsValuationPresentationAppointment({
      appointmentType: 'valuation_presentation',
      title: 'Valuation Presentation',
    }),
    true,
  )
  assert.equal(
    isKingstonsValuationPresentationAppointment({
      appointmentType: 'seller_valuation',
      title: 'Valuation Appointment',
    }),
    false,
  )

  const signedRequests = []
  const storageClient = {
    from(bucket) {
      return {
        createSignedUrl(pathValue, expiresInSeconds, options) {
          signedRequests.push({ bucket, pathValue, expiresInSeconds, options })
          return Promise.resolve({
            data: {
              signedUrl: `https://storage.example.test/${bucket}/${pathValue}?download=${encodeURIComponent(options.download)}`,
            },
            error: null,
          })
        },
      }
    },
  }

  const directUrl = await resolveKingstonsValuationDirectDownloadUrl({
    storageBucket: 'documents',
    storagePath: 'formal-valuations/lead-1/valuation.pdf',
    uploadedFileName: 'formal-valuation.pdf',
  }, { storageClient })
  assert.equal(directUrl, 'https://storage.example.test/documents/formal-valuations/lead-1/valuation.pdf?download=formal-valuation.pdf')
  assert.deepEqual(signedRequests[0], {
    bucket: 'documents',
    pathValue: 'formal-valuations/lead-1/valuation.pdf',
    expiresInSeconds: 60 * 60 * 24 * 14,
    options: { download: 'formal-valuation.pdf' },
  })
  const snakeCaseDirectUrl = await resolveKingstonsValuationDirectDownloadUrl({
    storage_bucket: 'documents',
    storage_path: 'formal-valuations/lead-1/snake.pdf',
    uploaded_file_name: 'snake-valuation.pdf',
  }, { storageClient })
  assert.equal(snakeCaseDirectUrl, 'https://storage.example.test/documents/formal-valuations/lead-1/snake.pdf?download=snake-valuation.pdf')

  const payload = buildKingstonsValuationDownloadEmailPayload({
    to: 'seller@example.test',
    recipientName: 'Seller One',
    valuationDownloadUrl: directUrl,
    propertyLabel: '19 Aspen Creek, Benoni North AH',
    agent: { name: 'Alexander Landman', email: 'alex@example.test' },
    appointment: { appointmentId: 'appt-1', appointmentType: 'valuation_presentation' },
    organisationId: 'org-1',
    organisationName: 'Kingstons Real Estate',
    branding: {
      logoDarkUrl: 'https://cdn.example.test/kingstons-dark-header.png',
      primaryColor: '#052b2b',
      secondaryColor: '#d49a18',
    },
    leadId: 'lead-1',
  })
  assert.equal(payload.type, 'kingstons_valuation_download')
  assert.equal(payload.to, 'seller@example.test')
  assert.equal(payload.valuationDownloadUrl, directUrl)
  assert.equal(payload.idempotencyKey, 'kingstons-valuation-download:appt-1:seller@example.test')
  assert.equal(payload.organisationLogoDarkUrl, 'https://cdn.example.test/kingstons-dark-header.png')

  const sentPayloads = []
  const sendResult = await sendKingstonsValuationDownloadEmailForPresentation({
    appointment: { appointmentId: 'appt-2', appointmentType: 'valuation_presentation' },
    documentRow: {
      storageBucket: 'documents',
      storagePath: 'formal-valuations/lead-2/valuation.pdf',
      uploadedFileName: 'valuation.pdf',
    },
    participants: [{ name: 'Seller One', email: 'seller@example.test', participantRole: 'Seller' }],
    lead: { leadId: 'lead-2' },
    propertyLabel: '19 Aspen Creek, Benoni North AH',
    agent: { name: 'Alexander Landman', email: 'alex@example.test' },
    organisationId: 'org-1',
    organisationName: 'Kingstons Real Estate',
    storageClient,
    emailInvoker: async (functionName, request) => {
      sentPayloads.push({ functionName, request })
      return { data: { ok: true, id: 'email-1' }, error: null }
    },
  })
  assert.equal(sendResult.status, 'sent')
  assert.equal(sentPayloads.length, 1)
  assert.equal(sentPayloads[0].functionName, 'send-email')
  assert.equal(sentPayloads[0].request.body.type, 'kingstons_valuation_download')
  assert.match(sentPayloads[0].request.body.valuationDownloadUrl, /download=valuation\.pdf/)

  const skipped = await sendKingstonsValuationDownloadEmailForPresentation({
    appointment: { appointmentId: 'appt-3', appointmentType: 'seller_valuation' },
    documentRow: { downloadUrl: 'https://storage.example.test/valuation.pdf' },
    participants: [{ name: 'Seller One', email: 'seller@example.test', participantRole: 'Seller' }],
    emailInvoker: async () => {
      throw new Error('should not send')
    },
  })
  assert.equal(skipped.status, 'skipped')
  assert.equal(skipped.reason, 'not_valuation_presentation')

  console.log('Kingstons valuation download email service tests passed.')
} finally {
  await server.close()
}
