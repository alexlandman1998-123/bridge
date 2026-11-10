import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildDevelopmentSitePlanSyndicationPayload } from '../src/core/developments/developmentSitePlanSyndication.js'

const appRoot = resolve(import.meta.dirname, '..')
const read = (path) => readFile(resolve(appRoot, path), 'utf8')

const [detailPage, availabilityWorkspace, desktopPublicPage, mobilePublicPage] = await Promise.all([
  read('src/pages/DevelopmentDetail.jsx'),
  read('src/components/developments/DevelopmentAvailabilityWorkspace.jsx'),
  read('src/pages/PublicDevelopmentLandingPage.jsx'),
  read('src/pages/MobilePublicDevelopmentExperience.jsx'),
])

assert.match(detailPage, /sitePlanUrl=\{marketingForm\.mediaLibrary\.sitePlanUrl \|\| marketingForm\.mediaLibrary\.masterplanUrl\}/)
assert.match(detailPage, /sitePlanMap=\{marketingForm\.mediaLibrary\.sitePlanMap\}/)
assert.match(detailPage, /updateMasterplanScene\(normalizedMarketing\.mediaLibrary\.visualMap,\s*\{\s*sitePlanMap\s*\}\)/)
assert.match(detailPage, /mediaLibrary: hydrateVisualMapMediaLibrary\(\{[\s\S]*?visualMap/)
assert.match(detailPage, /handleAvailabilitySitePlanUpload\(event\)/)
assert.match(detailPage, /renderSitePlanUploadImage\(sourceFile\)/)
assert.match(detailPage, /Original source PDF retained for this site plan/)
assert.match(detailPage, /onOpenSitePlanPublicationControls=\{\(\) => openMarketingHubSection\('public-page'\)\}/)
assert.match(detailPage, /buildDevelopmentSitePlanSyndicationPayload/)
const externalPlan = buildDevelopmentSitePlanSyndicationPayload({ mediaLibrary: { sitePlanUrl: 'https://fixture.test/plan.png', sitePlanMap: { unit: { x: 12, y: 24 } } } })
assert.equal(externalPlan.mode, 'asset_only')
assert.equal(externalPlan.sitePlanAsset.url, 'https://fixture.test/plan.png')
assert.equal(externalPlan.interactiveMap, undefined, 'Ordinary external portals must not receive interactive markers.')
assert.match(detailPage, /extractSitePlanPdfTextAnchors\(sourceFile\)/)
assert.match(detailPage, /buildPdfSitePlanUnitSuggestions/)
assert.match(detailPage, /evaluateDevelopmentSitePlanQuality/)
assert.match(detailPage, /sitePlanQuality=\{sitePlanQuality\}/)
assert.match(detailPage, /nextMediaLibrary\.sitePlanUrl = urls\[0\] \|\| nextMediaLibrary\.sitePlanUrl/)

// Placement, crop review and publication are independent controls. The visual
// scene now owns coordinates; the old inline public map was retired.
for (const pattern of [
  /onSaveSitePlanMap\?\.\(/,
  /sitePlanBackgroundStyle\(sitePlanUrl/,
  /reviewSitePlanPlacement/,
  /hasSavedMapPosition\(sitePlanMap, unit\.id\)/,
  /visibleSitePlanSuggestions/,
  /remapSitePlanCoordinates/,
  /onOpenSitePlanPublicationControls/,
  /Map checks need attention/,
  /sitePlanQuality\.issues/,
]) assert.match(availabilityWorkspace, pattern)
for (const page of [desktopPublicPage,mobilePublicPage]) {
  assert.match(page, /<PublicDevelopmentVisualExplorer/)
  assert.match(page, /inventory=\{inventory\}/)
  assert.match(page, /media=\{media\}/)
  assert.match(page, /visualMapOverride=\{renderVisualMap\}/)
}
console.log('development site-plan foundation contract checks passed')
