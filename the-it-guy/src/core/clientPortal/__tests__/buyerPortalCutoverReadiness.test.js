import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBuyerPortalCutoverReadiness } from '../buyerPortalCutoverReadiness.js'

function model(source) {
  return { source }
}

test('accepts a production portal only when every canonical model and live action boundary is present', () => {
  const readiness = buildBuyerPortalCutoverReadiness({
    source: 'production',
    models: {
      journey: model('production'),
      documents: model('production'),
      finance: model('production'),
      team: model('production'),
    },
    capabilities: {
      documentActions: true,
      financeActions: true,
      portalComments: true,
      contactActions: true,
    },
  })

  assert.equal(readiness.ready, true)
  assert.equal(readiness.releaseLabel, 'aligned')
  assert.deepEqual(readiness.missing, [])
})

test('fails closed when a model has the wrong source or a production action is absent', () => {
  const readiness = buildBuyerPortalCutoverReadiness({
    source: 'production',
    models: {
      journey: model('demo'),
      documents: model('production'),
      finance: model('production'),
      team: model('production'),
    },
    capabilities: {
      documentActions: true,
      financeActions: false,
      portalComments: true,
      contactActions: true,
    },
  })

  assert.equal(readiness.ready, false)
  assert.deepEqual(readiness.missing, ['journey', 'financeActions'])
})

test('uses simulation capabilities for the demo without pretending they are production writes', () => {
  const readiness = buildBuyerPortalCutoverReadiness({
    source: 'demo',
    models: Object.fromEntries(['journey', 'documents', 'finance', 'team'].map((key) => [key, model('demo')])),
    capabilities: { documentSimulation: true, financeSimulation: true, contactActions: true },
  })

  assert.equal(readiness.ready, true)
  assert.equal(readiness.source, 'demo')
})

test('requires the development delivery projection and snag action only for development buyers', () => {
  const base = {
    source: 'production',
    models: {
      journey: model('production'),
      documents: model('production'),
      finance: model('production'),
      team: model('production'),
    },
    capabilities: {
      documentActions: true,
      financeActions: true,
      portalComments: true,
      contactActions: true,
    },
  }

  const blocked = buildBuyerPortalCutoverReadiness({ ...base, developmentRequired: true })
  assert.equal(blocked.ready, false)
  assert.deepEqual(blocked.missing, ['developmentDelivery', 'developmentDeliveryActions'])

  const ready = buildBuyerPortalCutoverReadiness({
    ...base,
    developmentRequired: true,
    models: { ...base.models, developmentDelivery: { isDeveloperSale: true } },
    capabilities: { ...base.capabilities, developmentDeliveryActions: true },
  })
  assert.equal(ready.ready, true)
  assert.equal(ready.developmentRequired, true)
})
