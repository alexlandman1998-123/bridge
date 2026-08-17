import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const detailSource = readFileSync(resolve(root, 'src/pages/DevelopmentDetail.jsx'), 'utf8')
const headerSource = readFileSync(resolve(root, 'src/components/HeaderBar.jsx'), 'utf8')
const apiSource = readFileSync(resolve(root, 'src/lib/api.js'), 'utf8')

assert.match(
  headerSource,
  /if \(pathname\.startsWith\('\/developments\/'\)\) return ''/,
  'development detail routes should not show the generic Developments header title',
)

assert.ok(
  detailSource.includes('Manage the public listing content by unit type'),
  'editable marketing tab should use a simplified listing-style intro',
)

assert.ok(
  !detailSource.includes('Development Listing Backend'),
  'editable marketing tab should not use backend/admin wording',
)

assert.ok(
  detailSource.includes('<h4 className="text-sm font-semibold text-[#142132]">Unit Types</h4>'),
  'marketing tab should use unit types where the old sub-tabs were',
)

assert.ok(
  detailSource.includes("setMarketingFloorplanField(selectedMarketingFloorplan.id, 'priceFrom'"),
  'unit type editor should save an explicit price-from value',
)

assert.ok(
  detailSource.includes("setMarketingFloorplanField(selectedMarketingFloorplan.id, 'priceTo'"),
  'unit type editor should save an explicit price-to value',
)

assert.ok(
  detailSource.includes("setMarketingFloorplanField(selectedMarketingFloorplan.id, 'imageUrls'"),
  'unit type editor should save unit-specific image links',
)

assert.ok(
  detailSource.includes("setMarketingFloorplanField(selectedMarketingFloorplan.id, 'floorplanUrls'"),
  'unit type editor should save unit-specific floorplan links',
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
  detailSource.includes("handleMarketingAssetFileUpload(event, 'logo'"),
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
  apiSource.includes('developments/${developmentId}/${safeType}/'),
  'development upload helper should store files under a development-specific path',
)

assert.ok(
  detailSource.includes('formatMarketingFloorplanPriceSummary'),
  'marketing price summaries should read the from/to fields',
)

console.log('development marketing simplified checks passed')
