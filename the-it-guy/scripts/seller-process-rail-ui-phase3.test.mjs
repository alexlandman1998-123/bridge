import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
} from '../src/services/sellerProcessProfileService.js'
import { buildKingstonsSellerProcessRailModel } from '../src/services/sellerProcessRailModelService.js'

const appRoot = resolve(import.meta.dirname, '..')
const pageSource = readFileSync(resolve(appRoot, 'src/pages/AgentLeadsPage.jsx'), 'utf8')
const phase3Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase3-kingston-rail-ui.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

function sliceFunction(source, functionName, nextFunctionName) {
  const start = source.indexOf(`function ${functionName}`)
  assert.notEqual(start, -1, `${functionName} should exist`)
  const end = nextFunctionName ? source.indexOf(`function ${nextFunctionName}`, start) : source.length
  assert.notEqual(end, -1, `${nextFunctionName} should exist after ${functionName}`)
  return source.slice(start, end)
}

{
  const defaultModel = buildKingstonsSellerProcessRailModel({})
  assert.equal(defaultModel.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(defaultModel.visible, false)

  const kingstonsModel = buildKingstonsSellerProcessRailModel({
    sellerProcessProfile: KINGSTONS_SELLER_PROCESS_PROFILE,
  })
  assert.equal(kingstonsModel.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(kingstonsModel.visible, true)
}

{
  assert.match(pageSource, /import \{ buildKingstonsSellerProcessRailModel \} from '..\/services\/sellerProcessRailModelService'/)
  assert.match(pageSource, /const kingstonsSellerProcessRailModel = useMemo\(\(\) => buildKingstonsSellerProcessRailModel\(\{/)
  assert.match(pageSource, /sellerProcessProfile: sellerProcessProfileResolution\.profile/)
  assert.match(pageSource, /kingstonsSellerProcessRailModel=\{kingstonsSellerProcessRailModel\}/)
}

{
  const railSource = sliceFunction(pageSource, 'KingstonsSellerProcessRail', 'ListingReadinessCircle')
  assert.match(railSource, /if \(!model\?\.visible\) return null/)
  assert.match(railSource, /id="seller-journey"/)
  assert.match(railSource, /Kingstons Seller Process/)
  assert.match(railSource, /aria-label="Kingstons seller process rail"/)
  assert.match(railSource, /xl:grid-cols-6/)
  assert.match(pageSource, /if \(stage\.deferred\) return 'Deferred'/)
  assert.doesNotMatch(railSource, /onClick/)
  assert.doesNotMatch(railSource, /onAction/)
  assert.doesNotMatch(railSource, /createAppointmentAsync/)
  assert.doesNotMatch(railSource, /uploadPrivateListingDocument/)
  assert.doesNotMatch(railSource, /updatePrivateListing/)
}

{
  const layoutSource = sliceFunction(pageSource, 'SellerLeadWorkspaceLayout', 'OwnershipCard')
  assert.match(layoutSource, /kingstonsSellerProcessRailModel = null/)
  assert.match(layoutSource, /kingstonsSellerProcessRailModel\?\.visible\s*\?\s*<KingstonsSellerProcessRail model=\{kingstonsSellerProcessRailModel\} \/>/)
  assert.match(layoutSource, /:\s*<SellerJourneyRail journey=\{sellerJourney\} row=\{row\} listing=\{linkedSellerListing\} \/>/)
  assert.match(layoutSource, /<SellerProcessShadowPanel model=\{sellerProcessPanelModel\} onAction=\{handleAcquisitionAction\} \/>/)
}

{
  assert.match(phase3Doc, /Kingston Rail UI/)
  assert.match(phase3Doc, /does not wire rail clicks/)
  assert.match(phase3Doc, /default `SellerJourneyRail` remains/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-rail-ui-phase3'],
    'node scripts/seller-process-rail-ui-phase3.test.mjs',
  )
}

console.log('seller process rail UI Phase 3 contract passed')
