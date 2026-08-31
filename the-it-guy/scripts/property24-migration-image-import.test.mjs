import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {
  createProperty24MigrationImageImportPlan,
  downloadProperty24MigrationImage,
  importProperty24MigrationImages,
} from '../server/property24/migrationImageImportService.js'
import {
  parseProperty24MigrationImageImportArgs,
  runProperty24MigrationImageImport,
} from './property24-migration-image-import.mjs'

const organisationId = '11111111-1111-4111-8111-111111111111'
const rentalListingId = '22222222-2222-4222-8222-222222222222'
const saleListingId = '33333333-3333-4333-8333-333333333333'
const allowedHost = 'images.exdev.property24-test.com'
const publicDnsLookup = async () => [{ address: '93.184.216.34', family: 4 }]

const jpeg = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#c86432' } }).jpeg().toBuffer()
const png = await sharp({ create: { width: 5, height: 7, channels: 4, background: '#3264c8ff' } }).png().toBuffer()

const mappingPlan = {
  version: 'property24_migration_mapping_v1',
  status: 'READY_WITH_RESOLUTION_REQUIRED',
  generatedAt: '2026-08-31T09:00:00.000Z',
  context: { organisationId, environment: 'exdev', agencyId: 31382 },
  validation: { inputHashes: { agents: 'a', listings: 'b', images: 'c' } },
  listingPlans: [
    {
      identityKey: 'property24:exdev:31382:listing:100314819',
      listingNumber: 100314819,
      mediaPlan: {
        images: [
          { sourceUrl: `https://${allowedHost}/rental-2`, caption: 'Interior', sourceOrdinal: 2, sortOrder: 1, isCover: false },
          { sourceUrl: `https://${allowedHost}/rental-1`, caption: 'Exterior', sourceOrdinal: 1, sortOrder: 0, isCover: true },
        ],
      },
    },
    {
      identityKey: 'property24:exdev:31382:listing:100314820',
      listingNumber: 100314820,
      mediaPlan: {
        images: [
          { sourceUrl: `https://${allowedHost}/sale-1`, caption: 'Front exterior', sourceOrdinal: 1, sortOrder: 0, isCover: true },
        ],
      },
    },
  ],
}

function createFetchMock({ failures = new Map(), redirect = false } = {}) {
  const calls = []
  const fetchImpl = async (url) => {
    const parsed = new URL(url)
    calls.push(parsed.toString())
    const failureStatus = failures.get(parsed.pathname)
    if (failureStatus) return new Response('', { status: failureStatus })
    if (redirect && parsed.pathname === '/rental-1') {
      return new Response('', { status: 302, headers: { Location: `https://${allowedHost}/redirected-rental-1` } })
    }
    const body = parsed.pathname.includes('2') ? png : jpeg
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': parsed.pathname.includes('2') ? 'image/png' : 'image/jpeg', 'Content-Length': String(body.length) },
    })
  }
  return { fetchImpl, calls }
}

function createStorageMock() {
  const objects = new Map()
  const uploads = []
  const bucket = {
    async upload(objectPath, bytes, options) {
      uploads.push({ objectPath, bytes: Buffer.from(bytes), options })
      if (objects.has(objectPath)) return { data: null, error: { status: 409, message: 'The resource already exists' } }
      objects.set(objectPath, Buffer.from(bytes))
      return { data: { path: objectPath }, error: null }
    },
    async download(objectPath) {
      const bytes = objects.get(objectPath)
      return bytes
        ? { data: new Blob([bytes]), error: null }
        : { data: null, error: { status: 404, message: 'Not found' } }
    },
    getPublicUrl(objectPath) {
      return { data: { publicUrl: `https://storage.example.test/object/public/listing-media/${objectPath}` } }
    },
  }
  return {
    client: {
      storage: {
        from(name) {
          assert.equal(name, 'listing-media')
          return bucket
        },
        async getBucket(name) {
          return { data: { id: name, public: true }, error: null }
        },
      },
    },
    objects,
    uploads,
  }
}

assert.throws(() => parseProperty24MigrationImageImportArgs([]), /--mapping/)
assert.throws(() => parseProperty24MigrationImageImportArgs(['--mapping=x', '--concurrency=13']), /12 or less/)
assert.equal(parseProperty24MigrationImageImportArgs(['--mapping=x', '--apply']).apply, true)
assert.equal(parseProperty24MigrationImageImportArgs(['--mapping=x', '--no-resume']).resume, false)

const plan = createProperty24MigrationImageImportPlan(mappingPlan, {
  listingIds: { 100314819: rentalListingId, 100314820: saleListingId },
})
assert.equal(plan.status, 'READY')
assert.equal(plan.items.length, 3)
assert.equal(plan.items[0].sourceOrdinal, 1)
assert.equal(plan.items[0].sortOrder, 0)
assert.equal(plan.items[0].isCover, true)
assert.equal(plan.items[1].sourceOrdinal, 2)
assert.equal(plan.items[1].isCover, false)
assert.equal(plan.items[2].arch9ListingId, saleListingId)
assert.equal(plan.items[0].sourceKey.length, 64)

const unsafePlan = createProperty24MigrationImageImportPlan({
  ...mappingPlan,
  listingPlans: [{
    ...mappingPlan.listingPlans[0],
    mediaPlan: { images: [{ sourceUrl: 'http://localhost/private.jpg', sourceOrdinal: 1 }] },
  }],
})
assert.equal(unsafePlan.status, 'BLOCKED')
assert.ok(unsafePlan.blockers.some((blocker) => blocker.code === 'unsafe_source_protocol'))

let dryRunFetches = 0
const dryRun = await importProperty24MigrationImages({
  mappingPlan,
  fetchImpl: async () => { dryRunFetches += 1; throw new Error('must not fetch') },
  apply: false,
  listingIds: { 100314819: rentalListingId, 100314820: saleListingId },
  generatedAt: '2026-08-31T10:00:00.000Z',
})
assert.equal(dryRun.status, 'DRY_RUN')
assert.equal(dryRunFetches, 0)
assert.equal(dryRun.summary.pendingImageCount, 3)
assert.equal(dryRun.safety.storageWritesPerformed, false)
assert.equal(dryRun.safety.databaseWritesPerformed, false)

const redirectFetch = createFetchMock({ redirect: true })
const downloaded = await downloadProperty24MigrationImage(`https://${allowedHost}/rental-1`, {
  fetchImpl: redirectFetch.fetchImpl,
  dnsLookup: publicDnsLookup,
})
assert.equal(downloaded.contentType, 'image/jpeg')
assert.equal(downloaded.extension, 'jpg')
assert.equal(downloaded.width, 8)
assert.equal(downloaded.height, 6)
assert.equal(redirectFetch.calls.length, 2)

await assert.rejects(
  downloadProperty24MigrationImage(`https://${allowedHost}/html`, {
    fetchImpl: async () => new Response('<html>no</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    dnsLookup: publicDnsLookup,
  }),
  (error) => error.code === 'unsupported_image_content',
)
await assert.rejects(
  downloadProperty24MigrationImage(`https://${allowedHost}/large`, {
    fetchImpl: async () => new Response(jpeg, { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '999999' } }),
    dnsLookup: publicDnsLookup,
    maxBytes: 100,
  }),
  (error) => error.code === 'image_too_large',
)
await assert.rejects(
  downloadProperty24MigrationImage(`https://${allowedHost}/private-dns`, {
    fetchImpl: async () => new Response(jpeg, { status: 200, headers: { 'Content-Type': 'image/jpeg' } }),
    dnsLookup: async () => [{ address: '127.0.0.1', family: 4 }],
  }),
  (error) => error.code === 'unsafe_source_dns',
)

const fetchMock = createFetchMock()
const storage = createStorageMock()
const progress = []
const applied = await importProperty24MigrationImages({
  mappingPlan,
  storageClient: storage.client,
  fetchImpl: fetchMock.fetchImpl,
  dnsLookup: publicDnsLookup,
  apply: true,
  listingIds: { 100314819: rentalListingId, 100314820: saleListingId },
  concurrency: 2,
  onProgress: async (manifest) => progress.push(manifest.summary.completedImageCount),
  generatedAt: '2026-08-31T11:00:00.000Z',
})
assert.equal(applied.status, 'COMPLETE')
assert.equal(applied.summary.uploadedImageCount, 3)
assert.equal(applied.summary.reusedImageCount, 0)
assert.equal(applied.summary.failedImageCount, 0)
assert.equal(applied.summary.readyListingCount, 2)
assert.equal(applied.summary.listingMediaRowCount, 3)
assert.equal(applied.safety.sourceImagesDownloaded, true)
assert.equal(applied.safety.storageWritesPerformed, true)
assert.equal(applied.safety.databaseWritesPerformed, false)
assert.equal(storage.uploads.length, 3)
assert.equal(storage.uploads[0].options.upsert, false)
assert.equal(storage.uploads[0].options.cacheControl, '31536000')
assert.ok(applied.items.every((item) => item.storagePath.startsWith(`organisations/${organisationId}/property24/exdev/31382/`)))
assert.ok(applied.items.every((item) => item.storagePath.includes(item.sha256.slice(0, 20))))
assert.deepEqual(applied.listings[0].listingMediaRows.map((row) => [row.listing_id, row.sort_order, row.is_cover]), [
  [rentalListingId, 0, true],
  [rentalListingId, 1, false],
])
assert.deepEqual(progress.sort((left, right) => left - right), [1, 2, 3])

const callsBeforeResume = fetchMock.calls.length
const uploadsBeforeResume = storage.uploads.length
const resumed = await importProperty24MigrationImages({
  mappingPlan,
  storageClient: storage.client,
  fetchImpl: fetchMock.fetchImpl,
  dnsLookup: publicDnsLookup,
  existingManifest: applied,
  apply: true,
  listingIds: { 100314819: rentalListingId, 100314820: saleListingId },
})
assert.equal(resumed.status, 'COMPLETE')
assert.equal(resumed.summary.reusedImageCount, 3)
assert.equal(resumed.summary.uploadedImageCount, 0)
assert.equal(fetchMock.calls.length, callsBeforeResume)
assert.equal(storage.uploads.length, uploadsBeforeResume)
assert.equal(resumed.safety.sourceImagesDownloaded, false)
assert.ok(resumed.items.every((item) => item.resumed))

const partialFetch = createFetchMock({ failures: new Map([['/rental-2', 404]]) })
const partialStorage = createStorageMock()
const partial = await importProperty24MigrationImages({
  mappingPlan,
  storageClient: partialStorage.client,
  fetchImpl: partialFetch.fetchImpl,
  dnsLookup: publicDnsLookup,
  apply: true,
  attempts: 1,
})
assert.equal(partial.status, 'PARTIAL')
assert.equal(partial.summary.uploadedImageCount, 2)
assert.equal(partial.summary.failedImageCount, 1)
assert.equal(partial.items.find((item) => item.status === 'failed').error.code, 'source_http_error')

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'property24-migration-image-import-'))
try {
  const mappingPath = path.join(temporaryDirectory, 'mapping.json')
  const listingIdsPath = path.join(temporaryDirectory, 'listing-ids.json')
  const outputPath = path.join(temporaryDirectory, 'manifest.json')
  fs.writeFileSync(mappingPath, JSON.stringify(mappingPlan))
  fs.writeFileSync(listingIdsPath, JSON.stringify({ 100314819: rentalListingId, 100314820: saleListingId }))
  const cliStorage = createStorageMock()
  const cliFetch = createFetchMock()
  const previousExitCode = process.exitCode
  process.exitCode = undefined
  const cli = await runProperty24MigrationImageImport([
    `--mapping=${mappingPath}`,
    `--listing-ids=${listingIdsPath}`,
    `--output=${outputPath}`,
    '--apply',
    '--strict',
    '--concurrency=2',
  ], {
    storageClient: cliStorage.client,
    fetchImpl: cliFetch.fetchImpl,
    dnsLookup: publicDnsLookup,
    generatedAt: '2026-08-31T12:00:00.000Z',
  })
  assert.equal(cli.manifest.status, 'COMPLETE')
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).summary.completedImageCount, 3)
  assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600)
  assert.equal(process.exitCode, undefined)
  process.exitCode = previousExitCode
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
}

const appPackage = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(appPackage.scripts['property24:migration-image-import'], 'node scripts/property24-migration-image-import.mjs')
assert.equal(appPackage.scripts['test:property24-migration-image-import'], 'node scripts/property24-migration-image-import.test.mjs')

const migration = fs.readFileSync(new URL('../../supabase/migrations/20260831120000_property24_migration_listing_media_storage.sql', import.meta.url), 'utf8')
assert.match(migration, /'listing-media'/)
assert.match(migration, /15728640/)
assert.match(migration, /allowed_mime_types/)
assert.match(migration, /listing_media_storage_public_read/)
assert.match(migration, /bridge_is_active_member/)
assert.match(migration, /storage\.foldername\(name\)/)

console.log('Property24 migration image import tests passed')
