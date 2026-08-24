import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CLIENT_PORTAL_KINDS,
  CLIENT_PORTAL_NAVIGATION_MODES,
  resolveClientPortalProfile,
} from '../src/core/clientPortal/clientPortalProfile.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('classifies developer-direct buyer links as new development buyer portals', () => {
  const profile = resolveClientPortalProfile({
    workspace: 'buying',
    transaction: {
      transaction_type: 'developer_sale',
      sale_route: 'internal_developer_sale',
      development_id: 'dev-1',
    },
    settings: {
      snag_reporting_enabled: true,
      alteration_requests_enabled: true,
      service_reviews_enabled: true,
    },
  })

  assert.equal(profile.portalKind, CLIENT_PORTAL_KINDS.NEW_DEVELOPMENT_BUYER)
  assert.equal(profile.navigationMode, CLIENT_PORTAL_NAVIGATION_MODES.DEVELOPER_DEVELOPMENT)
  assert.equal(profile.saleRoute, 'internal_developer_sale')
  assert.equal(profile.isDeveloperBuyerPortal, true)
  assert.equal(profile.isDevelopmentBuyerPortal, true)
  assert.equal(profile.isAgencyBuyerPortal, false)
  assert.equal(profile.enabledSections.handover, true)
  assert.equal(profile.enabledSections.snags, true)
  assert.equal(profile.enabledSections.alterations, true)
  assert.equal(profile.supportLabels.primarySupportLabel, 'Developer Sales Team')
  assert.equal(profile.partyModel.seller.label, 'Developer')
})

test('classifies agency-introduced development links without losing developer portal modules', () => {
  const profile = resolveClientPortalProfile({
    workspace: 'buying',
    transaction: {
      transaction_type: 'developer_sale',
      sale_route: 'external_agency_sale',
      lead_owner: 'agency',
      ownership_model: 'agency_introduced',
      source_agency_org_id: 'agency-1',
      development_id: 'dev-1',
    },
    settings: {
      snag_reporting_enabled: true,
    },
  })

  assert.equal(profile.portalKind, CLIENT_PORTAL_KINDS.AGENCY_INTRODUCED_DEVELOPMENT_BUYER)
  assert.equal(profile.navigationMode, CLIENT_PORTAL_NAVIGATION_MODES.AGENCY_DEVELOPMENT)
  assert.equal(profile.saleRoute, 'external_agency_sale')
  assert.equal(profile.isAgencyBuyerPortal, true)
  assert.equal(profile.isAgencyIntroducedDevelopmentPortal, true)
  assert.equal(profile.isDevelopmentBuyerPortal, true)
  assert.equal(profile.enabledSections.handover, true)
  assert.equal(profile.enabledSections.snags, true)
  assert.equal(profile.enabledSections.alterations, false)
  assert.equal(profile.supportLabels.primarySupportLabel, 'Introducing Agency')
  assert.equal(profile.supportLabels.developerSupportLabel, 'Developer Operations')
  assert.equal(profile.partyModel.agency.visible, true)
})

test('classifies private-property links as agency resale portals and disables development-only modules', () => {
  const profile = resolveClientPortalProfile({
    workspace: 'buying',
    transaction: {
      transaction_type: 'private_property',
      sale_route: 'private_property_sale',
    },
    settings: {
      snag_reporting_enabled: true,
      alteration_requests_enabled: true,
      service_reviews_enabled: true,
    },
  })

  assert.equal(profile.portalKind, CLIENT_PORTAL_KINDS.AGENCY_RESALE_BUYER)
  assert.equal(profile.navigationMode, CLIENT_PORTAL_NAVIGATION_MODES.AGENCY_RESALE)
  assert.equal(profile.saleRoute, 'private_property_sale')
  assert.equal(profile.isAgencyBuyerPortal, true)
  assert.equal(profile.isPrivatePropertyBuyerPortal, true)
  assert.equal(profile.isDevelopmentBuyerPortal, false)
  assert.equal(profile.enabledSections.handover, false)
  assert.equal(profile.enabledSections.snags, false)
  assert.equal(profile.enabledSections.alterations, false)
  assert.equal(profile.enabledSections.review, false)
  assert.equal(profile.supportLabels.primarySupportLabel, 'Agency / Agent')
  assert.equal(profile.partyModel.seller.label, 'Seller')
})

test('keeps selling workspace links classified as seller portals', () => {
  const profile = resolveClientPortalProfile({
    workspace: 'selling',
    hasBuyingContext: false,
    hasSellingContext: true,
    transaction: {
      transaction_type: 'developer_sale',
      sale_route: 'internal_developer_sale',
      development_id: 'dev-1',
    },
    settings: {
      snag_reporting_enabled: true,
    },
  })

  assert.equal(profile.portalKind, CLIENT_PORTAL_KINDS.SELLER)
  assert.equal(profile.navigationMode, CLIENT_PORTAL_NAVIGATION_MODES.SELLER)
  assert.equal(profile.isSellerPortal, true)
  assert.equal(profile.enabledSections.handover, false)
  assert.equal(profile.enabledSections.snags, false)
})

test('threads the canonical portal profile through workspace service responses', () => {
  const serviceSource = readFileSync(
    new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url),
    'utf8',
  )

  assert.match(serviceSource, /resolveClientPortalProfile/)
  assert.match(serviceSource, /portalProfile,\n\s+client:/)
  assert.match(serviceSource, /__portalProfile: portalProfile/)
  assert.match(serviceSource, /portalKind: portalProfile\.portalKind/)
  assert.match(serviceSource, /navigationMode: portalProfile\.navigationMode/)
})
