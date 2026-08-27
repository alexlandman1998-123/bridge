import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { generateClientPortalNextActions } from '../src/lib/clientPortalNextActionsEngine.js'
import {
  buildClientPortalProfileDiagnostics,
  CLIENT_PORTAL_DIAGNOSTIC_CODES,
} from '../src/core/clientPortal/clientPortalProfileDiagnostics.js'

function buyerProfile(enabledSections = {}) {
  return {
    portalKind: 'agency_resale_buyer_portal',
    navigationMode: 'agency_resale',
    enabledSections: {
      overview: true,
      team: true,
      documents: true,
      details: true,
      appointments: true,
      bond_application: false,
      ...enabledSections,
    },
  }
}

function buyerBondContext(portalProfile) {
  return {
    workspaceMode: 'buying',
    portalProfile,
    onboarding: { status: 'signed_otp_received' },
    transaction: {
      onboarding_status: 'signed_otp_received',
      finance_type: 'bond',
      finance_managed_by: 'bond_originator',
      current_main_stage: 'FIN',
    },
    lifecycle: { mainStage: 'FIN' },
    documentCenter: { requiredDocuments: [] },
    portalData: { onboardingFormData: { formData: {} } },
  }
}

const profile = buyerProfile()
const guardedActions = generateClientPortalNextActions(buyerBondContext(profile))

assert.equal(guardedActions.length, 1, 'A disabled route must not create a competing passive state.')
assert.equal(guardedActions[0].id, 'portal_route_unavailable_bond_application_required')
assert.equal(guardedActions[0].type, 'portal_route_unavailable')
assert.equal(guardedActions[0].blocking, true)
assert.equal(guardedActions[0].actionRoute, 'team')
assert.equal(guardedActions[0].actionLabel, 'Contact team')
assert.equal(guardedActions[0].notificationEligible, false)
assert.equal(guardedActions[0].metadata.portalRouteUnavailable, true)
assert.equal(guardedActions[0].metadata.originalActionRoute, 'bond_application')
assert.equal(guardedActions[0].metadata.originalActionId, 'bond_application_required')
assert.equal(guardedActions[0].metadata.ownerRole, 'agent')
assert.equal(guardedActions[0].metadata.waitingOnRole, 'agent')

const diagnostics = buildClientPortalProfileDiagnostics({
  portalProfile: profile,
  transaction: buyerBondContext(profile).transaction,
  workspace: 'buying',
  nextActions: guardedActions,
})
const fallbackDiagnostic = diagnostics.find((item) => item.code === CLIENT_PORTAL_DIAGNOSTIC_CODES.BLOCKING_ACTION_ROUTE_FALLBACK)
assert.ok(fallbackDiagnostic, 'The existing portal diagnostics must expose the unavailable-route fallback.')
assert.equal(fallbackDiagnostic.severity, 'warning')
assert.equal(fallbackDiagnostic.metadata.originalRoute, 'bond_application')
assert.equal(fallbackDiagnostic.metadata.fallbackRoute, 'team')
assert.equal(fallbackDiagnostic.metadata.escalationOwnerRole, 'agent')

const overviewFallbackActions = generateClientPortalNextActions(buyerBondContext(buyerProfile({ team: false })))
assert.equal(overviewFallbackActions.length, 1)
assert.equal(overviewFallbackActions[0].actionRoute, 'overview')
assert.equal(overviewFallbackActions[0].actionLabel, 'View transaction')
assert.equal(overviewFallbackActions[0].blocking, true)

const submittedApplicationActions = generateClientPortalNextActions({
  ...buyerBondContext(profile),
  portalData: {
    onboardingFormData: {
      formData: { bond_application: { status: 'Submitted' } },
    },
  },
})
assert.equal(submittedApplicationActions.some((action) => action.type === 'portal_route_unavailable'), false)
assert.equal(submittedApplicationActions.some((action) => action.blocking), false)
assert.equal(
  submittedApplicationActions.some((action) => action.id === 'buyer_signed_otp_finance_in_progress'),
  true,
  'A disabled informational review link may collapse to the existing passive finance status because no client action is required.',
)

const workspaceServiceSource = await readFile(
  resolve(process.cwd(), 'src/services/clientPortalWorkspaceService.js'),
  'utf8',
)
assert.match(
  workspaceServiceSource,
  /resolveNextActionsForPortalCapabilities\(Array\.isArray\(seed\.nextActions\)/,
  'Seeded workspaces must use the same dead-end guard as live workspaces.',
)

console.log('Agent/buyer/seller Phase 7 dead-end route guard checks passed.')
