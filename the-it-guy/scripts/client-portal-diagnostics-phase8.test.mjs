import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CLIENT_PORTAL_DIAGNOSTIC_CODES,
  CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES,
  buildClientPortalProfileDiagnostics,
  summarizeClientPortalProfileDiagnostics,
} from '../src/core/clientPortal/clientPortalProfileDiagnostics.js'
import { resolveClientPortalProfile } from '../src/core/clientPortal/clientPortalProfile.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function codes(diagnostics = []) {
  return diagnostics.map((item) => item.code)
}

test('clean developer-direct development portal produces no diagnostics', () => {
  const diagnostics = buildClientPortalProfileDiagnostics({
    transaction: {
      id: 'tx-dev-direct',
      transaction_type: 'developer_sale',
      sale_route: 'internal_developer_sale',
      seller_party_type: 'developer',
      development_id: 'dev-1',
      unit_id: 'unit-1',
    },
    settings: {
      snag_reporting_enabled: true,
      alteration_requests_enabled: true,
      service_reviews_enabled: true,
    },
    nextActions: [
      { id: 'documents', actionRoute: 'documents' },
      { id: 'snags', actionRoute: 'snags' },
    ],
    activityFeed: [
      { id: 'handover', metadata: { actionRoute: 'handover' } },
    ],
  })

  assert.deepEqual(diagnostics, [])
})

test('agency resale portals report suppressed development settings without treating them as leaks', () => {
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
  const diagnostics = buildClientPortalProfileDiagnostics({
    portalProfile: profile,
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

  assert.equal(profile.isAgencyResaleBuyerPortal, true)
  assert.equal(codes(diagnostics).filter((code) => code === CLIENT_PORTAL_DIAGNOSTIC_CODES.SUPPRESSED_DEVELOPMENT_SETTING).length, 3)
  assert.equal(diagnostics.every((item) => item.severity === CLIENT_PORTAL_DIAGNOSTIC_SEVERITIES.INFO), true)
})

test('diagnostics flag contradictory origin fields and missing agency references', () => {
  const contradictory = buildClientPortalProfileDiagnostics({
    transaction: {
      transaction_type: 'private_property',
      sale_route: 'external_agency_sale',
    },
  })
  assert.equal(codes(contradictory).includes(CLIENT_PORTAL_DIAGNOSTIC_CODES.PRIVATE_PROPERTY_WITH_DEVELOPMENT_ROUTE), true)

  const missingAgency = buildClientPortalProfileDiagnostics({
    transaction: {
      transaction_type: 'developer_sale',
      sale_route: 'external_agency_sale',
      development_id: 'dev-1',
    },
  })
  assert.equal(codes(missingAgency).includes(CLIENT_PORTAL_DIAGNOSTIC_CODES.EXTERNAL_AGENCY_WITHOUT_AGENCY_REFERENCE), true)
})

test('diagnostics flag action and activity routes that leak into disabled portal sections', () => {
  const profile = resolveClientPortalProfile({
    workspace: 'buying',
    transaction: {
      transaction_type: 'private_property',
      sale_route: 'private_property_sale',
    },
  })
  const diagnostics = buildClientPortalProfileDiagnostics({
    portalProfile: profile,
    transaction: {
      transaction_type: 'private_property',
      sale_route: 'private_property_sale',
    },
    nextActions: [
      { id: 'bad-snag-action', actionRoute: 'snags' },
      { id: 'safe-documents', actionRoute: 'documents' },
    ],
    activityFeed: [
      { id: 'bad-handover-activity', metadata: { actionRoute: 'handover' } },
      { id: 'safe-team-activity', metadata: { actionRoute: 'team' } },
    ],
  })

  assert.equal(codes(diagnostics).includes(CLIENT_PORTAL_DIAGNOSTIC_CODES.DISABLED_SECTION_ACTION_LEAK), true)
  assert.equal(codes(diagnostics).includes(CLIENT_PORTAL_DIAGNOSTIC_CODES.DISABLED_SECTION_ACTIVITY_LEAK), true)
  const summary = summarizeClientPortalProfileDiagnostics(diagnostics)
  assert.equal(summary.errors >= 1, true)
  assert.equal(summary.warnings >= 1, true)
  assert.equal(summary.hasErrors, true)
})

test('workspace service exposes diagnostics beside capabilities', () => {
  const serviceSource = readFileSync(
    new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url),
    'utf8',
  )

  assert.match(serviceSource, /buildClientPortalProfileDiagnostics/)
  assert.match(serviceSource, /summarizeClientPortalProfileDiagnostics/)
  assert.match(serviceSource, /portalDiagnostics,\n\s+portalDiagnosticsSummary/)
  assert.match(serviceSource, /diagnosticSummary: portalDiagnosticsSummary/)
  assert.match(serviceSource, /__portalDiagnostics: portalDiagnostics/)
})
