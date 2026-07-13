import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')

const listingDetail = readFileSync(resolve(appRoot, 'src/pages/AgentListingDetail.jsx'), 'utf8')
const sourceOfTruthContract = readFileSync(resolve(appRoot, 'docs/seller-lead-listing-source-of-truth.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('listing detail uses the shared mandate continuity model', () => {
  assert.match(listingDetail, /buildSellerMandateContinuityModel/)
  assert.match(listingDetail, /const mandateContinuity = useMemo/)
  assert.match(listingDetail, /mandatePacketId/)
  assert.match(listingDetail, /sellerWorkspaceToken/)
})

test('listing readiness includes mandate continuity verification', () => {
  assert.match(listingDetail, /key:\s*'mandate_continuity'/)
  assert.match(listingDetail, /label:\s*'Mandate continuity verified'/)
  assert.match(listingDetail, /complete:\s*mandateContinuity\.ready/)
})

test('listing workspace renders the mandate continuity operational panel', () => {
  assert.match(listingDetail, />Mandate Continuity</)
  assert.match(listingDetail, /mandateContinuity\.checks\.map/)
  assert.match(listingDetail, /mandateContinuity\.packetId/)
  assert.match(listingDetail, /Confirms the signed mandate is connected across the listing, documents, seller portal and activity feed\./)
})

test('phase 7 visibility is documented in the source of truth', () => {
  assert.match(sourceOfTruthContract, /## Agent Operational Visibility/)
  assert.match(sourceOfTruthContract, /Listing\s+Readiness sidebar/)
  assert.match(sourceOfTruthContract, /Mandate Continuity/)
})

test('package exposes the phase 7 mandate guard', () => {
  assert.equal(
    packageJson.scripts['test:seller-mandate-phase7'],
    'node scripts/seller-mandate-phase7.test.mjs',
  )
})

console.log('seller mandate phase 7 tests passed')
