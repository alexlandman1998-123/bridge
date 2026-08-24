import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  filterNextActionsByPortalCapabilities,
  generateClientPortalNextActions,
} from '../src/lib/clientPortalNextActionsEngine.js'
import {
  buildClientPortalActivityFeedModel,
} from '../src/services/clientPortalActivityFeedService.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const resaleProfile = Object.freeze({
  portalKind: 'agency_resale_buyer_portal',
  navigationMode: 'agency_resale',
  enabledSections: Object.freeze({
    overview: true,
    documents: true,
    details: true,
    appointments: true,
    team: true,
    bond_application: false,
    handover: false,
    snags: false,
    alterations: false,
    review: false,
  }),
})

test('next-action capability filter removes disabled portal routes', () => {
  const actions = filterNextActionsByPortalCapabilities([
    { id: 'ok-docs', actionRoute: 'documents' },
    { id: 'blocked-bond', actionRoute: 'bond-application' },
    { id: 'blocked-snags', actionRoute: 'snags' },
    { id: 'ok-overview', actionRoute: 'overview' },
  ], {
    portalProfile: resaleProfile,
  })

  assert.deepEqual(actions.map((action) => action.id), ['ok-docs', 'ok-overview'])
})

test('generated buyer next actions never point to disabled portal sections', () => {
  const actions = generateClientPortalNextActions({
    workspaceMode: 'buying',
    portalProfile: resaleProfile,
    onboarding: { status: 'submitted' },
    transaction: { finance_type: 'bond' },
    documentCenter: { requiredDocuments: [] },
    portalData: { onboardingFormData: { formData: {} } },
  })

  assert.equal(actions.some((action) => action.actionRoute === 'bond_application'), false)
  assert.equal(actions.some((action) => action.actionRoute === 'overview'), true)
  assert.equal(actions.every((action) => action.metadata.portalKind === resaleProfile.portalKind), true)
  assert.equal(actions.every((action) => action.metadata.navigationMode === resaleProfile.navigationMode), true)
})

test('activity feed drops action shortcuts into disabled portal sections', () => {
  const model = buildClientPortalActivityFeedModel({
    portalProfile: resaleProfile,
    portalData: {
      lastUpdated: '2026-08-24T08:00:00.000Z',
      transaction: {
        id: 'tx-1',
        finance_type: 'bond',
        bond_application_status: 'not_started',
        updated_at: '2026-08-24T08:00:00.000Z',
      },
      events: [
        {
          id: 'docs-event',
          type: 'document_requested',
          visibility: 'client_visible',
          created_at: '2026-08-24T08:00:00.000Z',
          metadata: {
            audience: 'buyer',
            visibility: 'client_visible',
            actionLabel: 'Open Documents',
            actionRoute: 'documents',
          },
        },
      ],
    },
  }, 'buyer')

  assert.equal(model.items.some((event) => event.metadata.actionRoute === 'bond_application'), false)
  assert.equal(model.items.some((event) => event.metadata.actionRoute === 'documents'), true)
})

test('workspace payload exposes portal capabilities beside profile and context', () => {
  const serviceSource = readFileSync(
    new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url),
    'utf8',
  )

  assert.match(serviceSource, /function buildClientPortalCapabilities/)
  assert.match(serviceSource, /portalCapabilities,\n\s+__portalCapabilities: portalCapabilities/)
  assert.match(serviceSource, /enabledSections: portalCapabilities\.enabledSections/)
  assert.match(serviceSource, /disabledSections: portalCapabilities\.disabledSections/)
  assert.match(serviceSource, /filterNextActionsByPortalCapabilities/)
  assert.match(serviceSource, /filterActivityByPortalCapabilities/)
})
