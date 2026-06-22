import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {
  COMMERCIAL_ASSET_CLASSES,
  CommercialAssetConfiguration,
  getCommercialAssetConfiguration,
  normalizeCommercialAssetClass,
} from '../src/modules/commercial/commercialAssetConfiguration.js'

const detailSource = await fs.readFile(new URL('../src/modules/commercial/pages/CommercialLeadDetailPage.jsx', import.meta.url), 'utf8')

assert.deepEqual(COMMERCIAL_ASSET_CLASSES, ['retail', 'office', 'industrial', 'agricultural', 'mixed_use', 'other'])
assert.equal(normalizeCommercialAssetClass('Mixed Use'), 'mixed_use')
assert.equal(normalizeCommercialAssetClass('warehouse'), 'other')

for (const assetClass of ['retail', 'office', 'industrial', 'agricultural', 'mixed_use']) {
  const config = getCommercialAssetConfiguration(assetClass)
  assert.equal(config.assetClass, assetClass, `${assetClass} config should resolve`)
  assert.ok(config.propertyFields.length > 0, `${assetClass} should define property fields`)
  assert.ok(config.requirementFields.length > 0, `${assetClass} should define requirement fields`)
  assert.ok(config.readinessChecks.length > 0, `${assetClass} should define readiness checks`)
  assert.ok(config.matchingRules.length > 0, `${assetClass} should define matching rules`)
  assert.ok(config.dashboardCards.length > 0, `${assetClass} should define dashboard cards`)
}

assert.ok(CommercialAssetConfiguration.retail.propertyFields.some((field) => field.label === 'Anchor Tenant'))
assert.ok(CommercialAssetConfiguration.retail.requirementFields.some((field) => field.label === 'Foot Traffic Requirement'))
assert.ok(CommercialAssetConfiguration.office.propertyFields.some((field) => field.label === 'Office Grade'))
assert.ok(CommercialAssetConfiguration.office.matchingRules.includes('Meeting Rooms'))
assert.ok(CommercialAssetConfiguration.industrial.propertyFields.some((field) => field.label === 'Power Supply'))
assert.ok(CommercialAssetConfiguration.industrial.readinessChecks.some((check) => check.label === 'Power Captured'))
assert.ok(CommercialAssetConfiguration.agricultural.propertyFields.some((field) => field.label === 'Water Rights'))
assert.ok(CommercialAssetConfiguration.agricultural.documentChecklist.includes('Infrastructure Reports'))
assert.ok(CommercialAssetConfiguration.mixed_use.dashboardCards.some((card) => card.label === 'Use Breakdown'))

for (const marker of [
  'AssetIntelligenceCards',
  'AssetIntelligenceFields',
  'AssetMatchingRules',
  'getCommercialAssetConfiguration',
  'buildAssetReadinessChecks',
  'buildAssetDocumentChecklist',
  'assetIntelligence',
  'asset_intelligence',
]) {
  assert.match(detailSource, new RegExp(marker), `detail page should use ${marker}`)
}

for (const dynamicLabel of [
  'Retail Profile',
  'Office Profile',
  'Industrial Profile',
  'Agricultural Profile',
  'Retail Suitability',
  'Corporate Readiness',
  'Logistics Suitability',
  'Operational Suitability',
  'Dynamic asset fields',
]) {
  assert.match(detailSource + JSON.stringify(CommercialAssetConfiguration), new RegExp(dynamicLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `asset intelligence should include ${dynamicLabel}`)
}

assert.match(detailSource, /\.readinessChecks\.map/, 'readiness checks should be configuration driven')
assert.match(detailSource, /\.documentChecklist/, 'document checklist should be configuration driven')
assert.match(detailSource, /\.matchingRules\.map/, 'matching rules should render dynamically')
assert.doesNotMatch(detailSource, /function Retail.*Page|function Office.*Page|function Industrial.*Page|function Agricultural.*Page/, 'asset intelligence should not create duplicate asset-class pages')

console.log('commercial asset intelligence tests passed')
