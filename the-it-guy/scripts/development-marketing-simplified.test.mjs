import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const detailSource = readFileSync(resolve(root, 'src/pages/DevelopmentDetail.jsx'), 'utf8')
const headerSource = readFileSync(resolve(root, 'src/components/HeaderBar.jsx'), 'utf8')
const apiSource = readFileSync(resolve(root, 'src/lib/api.js'), 'utf8')

assert.match(detailSource, /id: 'campaigns', label: 'Campaigns'/, 'development marketing should expose the Campaigns tab')
assert.match(detailSource, /documents: 'campaigns'/, 'legacy Marketing Documents links should open Campaigns')
assert.match(detailSource, /marketingHubSection === 'campaigns'.*DevelopmentMarketingCampaigns/, 'Campaigns should open the development campaign workspace')

assert.match(
  headerSource,
  /if \(pathname\.startsWith\('\/developments\/'\)\) return ''/,
  'development detail routes should not show the generic Developments header title',
)

assert.ok(
  !detailSource.includes('Development Listing Backend'),
  'editable marketing tab should not use backend/admin wording',
)



assert.ok(
  detailSource.includes('imageUrls: appendUniqueTextareaValues(item.imageUrls, urls)'),
  'unit type uploads should save unit-specific image links',
)

assert.ok(
  detailSource.includes('floorplanUrls: appendUniqueTextareaValues(item.floorplanUrls, urls)'),
  'unit type uploads should save unit-specific floorplan links',
)

assert.ok(
  detailSource.includes("handleMarketingAssetFileUpload(event, 'marketing'"),
  'marketing tab should upload gallery images directly from the marketing workspace',
)

assert.ok(
  detailSource.includes("handleMarketingAssetFileUpload(event, 'floorplan'"),
  'marketing tab should upload floorplans directly from the marketing workspace',
)

assert.ok(
  detailSource.includes("['logo', 'development-logo', 'Light logo'") &&
    detailSource.includes('handleMarketingAssetFileUpload(event, documentType, { uploadKey'),
  'marketing tab should upload a development logo for future collateral',
)

assert.ok(
  !detailSource.includes('Manage Image Uploads') && !detailSource.includes('Manage Floorplan Uploads'),
  'marketing media controls should not route users into the documents workflow',
)

assert.ok(
  apiSource.includes('export async function uploadDevelopmentDocumentAsset'),
  'development assets should have a file upload helper that creates development document rows',
)

assert.ok(
  apiSource.includes('floorplans: floorplansSource.map') &&
    apiSource.includes('source.unit_types') &&
    apiSource.includes('normalizeMarketingFloorplanValue'),
  'development marketing content normalization should preserve saved unit types and legacy snake_case unit data',
)

assert.ok(
  detailSource.includes('shouldRecoverUnmatchedAssets') &&
    detailSource.includes('!knownUnitKeys.has(linkedUnitKey)') &&
    detailSource.includes('source.floorplan_id'),
  'development media tab should recover previously uploaded assets when a single unit type has a regenerated id',
)

assert.ok(
  detailSource.includes('handleReservationDepositRequiredChange') &&
    detailSource.includes('reservation-deposit-configuration-fields'),
  'reservation deposit toggle should keep the expanded deposit fields in view',
)

assert.ok(
  apiSource.includes('developments/${developmentId}/${safeType}/'),
  'development upload helper should store files under a development-specific path',
)

const developmentUploadSource = apiSource.match(/export async function uploadDevelopmentDocumentAsset[\s\S]*?\n}\n\nexport async function deleteDevelopmentDocument/)?.[0] || ''
assert.doesNotMatch(
  developmentUploadSource,
  /upsert:\s*true/,
  'development asset uploads use UUID object paths and should not require Supabase Storage update/select policies',
)

assert.ok(
  detailSource.includes('formatMarketingFloorplanPriceSummary'),
  'marketing price summaries should read the from/to fields',
)

console.log('development marketing simplified checks passed')
