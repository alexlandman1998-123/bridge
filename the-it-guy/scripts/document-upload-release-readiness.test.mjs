import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  DOCUMENT_UPLOAD_RELEASE_MATRIX as surfaces,
  DOCUMENT_UPLOAD_RELEASE_SCENARIOS as scenarios,
  DOCUMENT_UPLOAD_REQUIRED_MIGRATIONS,
  buildDocumentUploadReleaseReadiness,
} from '../src/services/documents/documentUploadReleaseReadinessService.js'

const now = Date.parse('2026-10-08T10:00:00Z')
const target = { environment: 'preview', projectId: 'test-project', buildId: 'test-build', runId: 'test-run' }
const digest = 'a'.repeat(64)
const context = { tenantId: 'tenant-one', ownerType: 'transaction', ownerId: 'tx-one', slotKey: 'proof', partyId: 'buyer-one' }
const observations = {
  upload: { metadataSaved: true, objectExists: true, sourceSha256: digest, sourceBytes: 42, intendedContext: { ...context } },
  persistence: { freshRead: true, objectExists: true },
  visibility: { visible: true, reviewStatusPreserved: true },
  download: { expectedSha256: digest, actualSha256: digest, expectedBytes: 42, actualBytes: 42 },
  retry: { metadataRows: 1, storageObjects: 1, recovered: true, faultInjected: true },
  failedNetwork: { metadataRows: 1, storageObjects: 1, recovered: true, faultInjected: true },
  reopen: { freshRead: true, objectExists: true },
  replacement: { documentId: 'new', path: 'tenant/new.pdf', previousDocumentId: 'one', previousPath: 'tenant/one.pdf', latestOnFreshRead: true, previousVersionRetained: true, actualSha256: digest, expectedSha256: digest },
  expiredUrl: { expectedSha256: digest, actualSha256: digest, expectedBytes: 42, actualBytes: 42, expiredLinkRejected: true, freshLinkRequested: true },
  roleAccess: { allowedActor: 'buyer', deniedActor: 'unassigned', allowedDownload: true, deniedMetadata: true, deniedStorage: true },
  tenantIsolation: { ownerTenant: 'one', otherTenant: 'two', deniedMetadata: true, deniedStorage: true, deniedWrite: true },
}
assert.equal(surfaces.length, 27)
assert.equal(new Set(surfaces.map((surface) => surface.id)).size, 27)
assert.equal(scenarios.length, 11)
for (const surface of surfaces) await readFile(new URL(`../${surface.source}`, import.meta.url))
const evidenceBySurface = Object.fromEntries(surfaces.map(({ id, variants }) => [id, Object.fromEntries(variants.map((variant) => [variant, Object.fromEntries(scenarios.map((scenario) => [scenario, {
  ...target, surfaceId: id, variant, scenario, mode: 'hosted', status: 'passed', checkedAt: new Date(now).toISOString(), artifact: 'fixture-observation.json', artifactSha256: digest,
  observation: { documentId: 'one', bucket: 'documents', path: 'tenant/one.pdf', recordContext: { ...context }, ...observations[scenario] },
}]))]))]))
const options = { evidenceBySurface, target, now, appliedMigrationVersions: DOCUMENT_UPLOAD_REQUIRED_MIGRATIONS, malwareScan: { scanned: true } }
assert.equal(buildDocumentUploadReleaseReadiness(options).ready, true)
const first = surfaces[0]
const variant = first.variants[0]
let checks = 5
function rejected(mutator, label) {
  const input = structuredClone(options)
  mutator(input)
  assert.equal(buildDocumentUploadReleaseReadiness(input).ready, false, label)
  checks++
}
for (const surface of surfaces) for (const name of surface.variants) for (const scenario of scenarios) {
  rejected((input) => { delete input.evidenceBySurface[surface.id][name][scenario] }, `${surface.id}/${name}/${scenario} cannot be omitted`)
}
for (const key of Object.keys(target)) rejected((input) => { input.target[key] = 'wrong-target' }, `wrong ${key}`)
for (const mutate of [
  (r) => { r.mode = 'local' },
  (r) => { r.checkedAt = 'not-a-date' },
  (r) => { r.checkedAt = new Date(now + 1).toISOString() },
  (r) => { r.checkedAt = new Date(now - 86400001).toISOString() },
  (r) => { r.artifact = '' },
  (r) => { r.artifactSha256 = 'invalid' },
  (r) => { r.status = 'failed' },
  (r) => { r.observation.actualSha256 = 'b'.repeat(64) },
  (r) => { r.observation.documentId = 'different-matter' },
  (r) => { r.observation.bucket = 'different-bucket' },
  (r) => { r.observation.expectedBytes = 99 },
]) rejected((input) => mutate(input.evidenceBySurface[first.id][variant].download), 'reject invalid download evidence')
rejected((input) => { input.evidenceBySurface[first.id][variant].expiredUrl.observation.expiredLinkRejected = false }, 'expired link must actually be tested')
rejected((input) => { input.evidenceBySurface[first.id][variant].replacement.observation.path = 'tenant/one.pdf' }, 'replacement must have its own identity')
rejected((input) => { input.evidenceBySurface[first.id][variant].retry.observation.metadataRows = 2 }, 'retry cannot create duplicate metadata')
rejected((input) => { input.evidenceBySurface[first.id][variant].failedNetwork.observation.storageObjects = 2 }, 'lost replies cannot duplicate storage')
rejected((input) => { input.evidenceBySurface[first.id][variant].roleAccess.observation.deniedStorage = false }, 'wrong-role storage must be denied')
rejected((input) => { input.evidenceBySurface[first.id][variant].tenantIsolation.observation.deniedWrite = false }, 'cross-tenant writes must be denied')
rejected((input) => { input.evidenceBySurface[first.id][variant].upload = true }, 'booleans are not acceptance receipts')
rejected((input) => { input.appliedMigrationVersions = [] }, 'required migrations')
rejected((input) => { input.malwareScan.scanned = false }, 'existing scanner gate remains intact')
rejected((input) => { input.evidenceBySurface[first.id][variant].download.observation = null }, 'malformed observation is not evidence')
rejected((input) => { input.now = NaN }, 'invalid comparison clock cannot accept stale evidence')
rejected((input) => { input.maxEvidenceAgeMs = NaN }, 'invalid evidence lifetime fails closed')
for (const key of Object.keys(context)) rejected((input) => { input.evidenceBySurface[first.id][variant].download.observation.recordContext[key] = 'wrong-context' }, `wrong ${key} cannot pass even when the bytes match`)
for (const key of ['surfaceId', 'variant', 'scenario']) rejected((input) => { input.evidenceBySurface[first.id][variant].download[key] = 'borrowed-journey' }, `evidence from another ${key} cannot certify this journey`)
assert.equal(buildDocumentUploadReleaseReadiness().ready, false)
console.log(`Document acceptance gate: ${checks} assertions passed; 27 areas, ${buildDocumentUploadReleaseReadiness(options).summary.variants} variants, 11 scenarios. Synthetic receipts test the gate only; no hosted journey is certified.`)
