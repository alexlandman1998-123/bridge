import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })

try {
  const {
    DOCUMENT_UPLOAD_RELEASE_MATRIX,
    DOCUMENT_UPLOAD_RELEASE_SCENARIOS,
    DOCUMENT_UPLOAD_REQUIRED_MIGRATIONS,
    buildDocumentUploadReleaseReadiness,
  } = await server.ssrLoadModule('/src/services/documents/documentUploadReleaseReadinessService.js')

  assert.equal(DOCUMENT_UPLOAD_RELEASE_MATRIX.length, 11)
  assert.deepEqual(DOCUMENT_UPLOAD_RELEASE_SCENARIOS, ['upload', 'persistence', 'visibility', 'download', 'retry', 'failedNetwork'])
  const passingEvidence = Object.fromEntries(DOCUMENT_UPLOAD_RELEASE_MATRIX.map(({ id }) => [
    id,
    Object.fromEntries(DOCUMENT_UPLOAD_RELEASE_SCENARIOS.map((scenario) => [scenario, true])),
  ]))
  const ready = buildDocumentUploadReleaseReadiness({
    evidenceBySurface: passingEvidence,
    appliedMigrationVersions: DOCUMENT_UPLOAD_REQUIRED_MIGRATIONS,
    malwareScan: { scanned: true },
  })
  assert.equal(ready.ready, true)
  assert.equal(ready.summary.readySurfaces, 11)

  const blocked = buildDocumentUploadReleaseReadiness({ evidenceBySurface: passingEvidence })
  assert.equal(blocked.ready, false)
  assert.equal(blocked.missingMigrations.length, 2)
  assert.equal(blocked.scannerConfigured, false)

  const [api, privateListings, developer, commercial, rental, panel, attorney, bond, clientButton] = await Promise.all([
    readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/developerDocumentPortalService.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/commercial/services/commercialPortalApi.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/services/publicRentalApplicationApi.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DocumentsPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AttorneyCloseoutPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/BondCommissionPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/client-portal/documents/ClientDocumentUploadButton.jsx', import.meta.url), 'utf8'),
  ])
  assert.match(api, /export async function uploadClientPortalDocument/)
  assert.match(api, /export async function uploadExternalDocument/)
  assert.match(api, /export async function uploadDocument/)
  assert.match(api, /export async function uploadTransactionAttorneyCloseoutDocument/)
  assert.match(api, /export async function uploadTransactionBondCloseoutDocument/)
  assert.match(privateListings, /export async function uploadPrivateListingDocument/)
  assert.match(developer, /export async function uploadDeveloperDocumentPortalFile/)
  assert.match(commercial, /export async function uploadCommercialPortalDocument/)
  assert.match(rental, /validateRentalDocumentUpload/)
  assert.match(panel, /DocumentUploadStatus/)
  assert.match(attorney, /DocumentUploadStatus/)
  assert.match(bond, /DocumentUploadStatus/)
  assert.match(clientButton, /Uploading/)
  console.log('document upload release-readiness tests passed')
} finally {
  await server.close()
}
