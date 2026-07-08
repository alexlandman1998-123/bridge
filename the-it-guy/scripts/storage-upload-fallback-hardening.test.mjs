import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  isStorageBucketMissingError,
  isStoragePermissionDeniedError,
  uploadToStorageCandidateBuckets,
} from '../src/lib/storageFallbacks.js'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

assert.equal(
  packageJson.scripts['test:storage-upload-fallback-hardening'],
  'node scripts/storage-upload-fallback-hardening.test.mjs',
  'package script should expose storage upload fallback hardening checks',
)

assert.equal(
  isStorageBucketMissingError({ statusCode: '404', message: 'Bucket not found' }),
  true,
  'storage helper should classify missing buckets',
)
assert.equal(
  isStoragePermissionDeniedError({ statusCode: '403', message: 'new row violates row-level security policy' }),
  true,
  'storage helper should classify storage RLS errors as permission failures',
)

const attempts = []
const successfulFallback = await uploadToStorageCandidateBuckets({
  bucketCandidates: ['organisation-branding', 'documents'],
  upload: async (bucketName) => {
    attempts.push(bucketName)
    if (bucketName === 'organisation-branding') {
      return { error: { statusCode: '403', message: 'new row violates row-level security policy' } }
    }
    return { data: { path: 'ok' }, error: null }
  },
  missingBucketMessage: 'missing',
  accessDeniedMessage: 'access denied',
})

assert.deepEqual(
  attempts,
  ['organisation-branding', 'documents'],
  'storage helper should continue to fallback buckets after a permission-blocked candidate',
)
assert.equal(successfulFallback.bucket, 'documents', 'storage helper should return the fallback bucket that succeeds')

await assert.rejects(
  () =>
    uploadToStorageCandidateBuckets({
      bucketCandidates: ['organisation-branding', 'documents'],
      upload: async () => ({ error: { statusCode: '403', message: 'permission denied' } }),
      missingBucketMessage: 'missing',
      accessDeniedMessage: 'storage access unavailable',
      accessDeniedCode: 'storage_access_probe_failed',
    }),
  (error) => {
    assert.equal(error.message, 'storage access unavailable')
    assert.equal(error.code, 'storage_access_probe_failed')
    assert.deepEqual(error.checkedBuckets, ['organisation-branding', 'documents'])
    assert.ok(error.cause)
    return true
  },
  'storage helper should only surface access guidance after every candidate fails',
)

const hardenedFiles = [
  'src/services/attorneyFirms.js',
  'src/lib/settingsApi.js',
  'src/lib/documentPacketsApi.js',
  'src/lib/api.js',
  'src/services/privateListingService.js',
  'src/modules/commercial/services/commercialApi.js',
  'src/modules/commercial/services/commercialLandlordService.js',
  'src/modules/commercial/services/commercialPortalApi.js',
  'src/modules/commercial/services/commercialOnboardingApi.js',
]

for (const relativePath of hardenedFiles) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  assert.match(source, /uploadToStorageCandidateBuckets/, `${relativePath} should use the shared storage fallback helper`)
  assert.match(source, /accessDeniedMessage:/, `${relativePath} should include a storage readiness message`)
}

console.log('storage upload fallback hardening tests passed')
