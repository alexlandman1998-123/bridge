import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const contract = JSON.parse(await readFile(new URL('config/client-portal-launch-contract.json', root), 'utf8'))
const docs = await readFile(new URL('docs/client-portal-launch-phase0-contract.md', root), 'utf8')

const surfaces = new Map(contract.surfaces.map((surface) => [surface.id, surface]))
const requiredByPersona = {
  buyer: ['overview', 'journey', 'documents', 'finance', 'bond-application', 'appointments', 'messages', 'team', 'support'],
  seller: ['overview', 'journey', 'documents', 'offers', 'appointments', 'messages', 'team', 'support'],
}

test('Phase 0 contract fixes the responsive and performance launch boundary', () => {
  assert.equal(contract.schemaVersion, 1)
  assert.equal(contract.status, 'phase-0-approved')
  assert.equal(contract.principles.capabilityParity, 'required')
  assert.equal(contract.principles.identicalLayout, false)
  assert.equal(contract.principles.canonicalDataPerCapability, true)
  assert.equal(contract.principles.mobileFirstMinimumWidthPx, 360)
  assert.ok(contract.principles.minimumTouchTargetPx >= 44)
  assert.deepEqual(Object.keys(contract.viewports), ['mobileSmall', 'mobileStandard', 'tablet', 'desktop'])
  assert.ok(contract.performanceBudgets.mobileUsefulContentMs <= 1500)
  assert.ok(contract.performanceBudgets.mobileSlowNetworkCoreContentMs <= 2500)
  assert.ok(contract.performanceBudgets.cachedNavigationResponseMs <= 100)
  assert.ok(contract.performanceBudgets.maximumCumulativeLayoutShift <= 0.1)
  assert.equal(contract.performanceBudgets.routeCrashCount, 0)
  assert.equal(contract.performanceBudgets.deadControlCount, 0)
})

test('buyer and seller launch surfaces have explicit capabilities and actions', () => {
  assert.deepEqual(contract.personas, ['buyer', 'seller'])
  for (const [persona, requiredSurfaces] of Object.entries(requiredByPersona)) {
    for (const id of requiredSurfaces) {
      const surface = surfaces.get(id)
      assert.ok(surface, `${persona} surface ${id} must exist`)
      assert.ok(surface.personas.includes(persona), `${id} must apply to ${persona}`)
      assert.ok(surface.requiredCapabilities.length > 0, `${id} must define capabilities`)
      assert.ok(surface.requiredActions.length > 0, `${id} must define actions`)
    }
  }
  assert.notDeepEqual(surfaces.get('messages').requiredCapabilities, surfaces.get('team').requiredCapabilities)
})

test('navigation, state, branding and release evidence fail closed', () => {
  for (const persona of contract.personas) {
    const primaryCount = contract.surfaces.filter((surface) => surface.primaryNavigation && surface.personas.includes(persona)).length
    assert.ok(primaryCount <= 4, `${persona} may expose no more than four capability destinations before More`)
  }
  for (const state of ['loading', 'ready', 'empty', 'error', 'offline', 'expired-link', 'unauthorised']) {
    assert.ok(contract.globalStates.includes(state), `missing required global state: ${state}`)
  }
  for (const token of ['agencyName', 'logoLightUrl', 'logoDarkUrl', 'primaryColour', 'secondaryColour', 'accentColour', 'supportContact']) {
    assert.ok(contract.branding.requiredTokens.includes(token), `missing brand token: ${token}`)
  }
  assert.ok(contract.responsiveRules.some((rule) => /same canonical data/i.test(rule)))
  assert.ok(contract.responsiveRules.some((rule) => /no more than two interactions/i.test(rule)))
  assert.ok(contract.releaseGates.some((gate) => /Missing required evidence blocks release/i.test(gate)))
  assert.ok(contract.releaseGates.some((gate) => /Product owner signs off/i.test(gate)))
})

test('human-readable contract records the current blockers and validation command', () => {
  for (const phrase of [
    'Capability parity matrix',
    'Messages and Team are distinct capabilities',
    'Seller portal crashes',
    'Buyer mobile menu control has no action',
    'Buyer Messages route renders Team',
    'npm run test:client-portal-launch-phase0',
  ]) {
    assert.match(docs, new RegExp(phrase, 'i'))
  }
})
