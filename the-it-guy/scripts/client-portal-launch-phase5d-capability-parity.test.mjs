import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const [contract, packet, portalSource, foundationSource] = await Promise.all([
  readFile(new URL('config/client-portal-launch-contract.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('config/client-portal-launch-phase5d-capability-parity.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('src/pages/ClientPortal.jsx', root), 'utf8'),
  readFile(new URL('src/components/client-portal/ClientPortalResponsiveFoundation.jsx', root), 'utf8')
])

test('every Phase 0 surface and persona has a parity mapping', () => {
  const mappings = new Map(packet.surfaceMappings.map((surface) => [surface.id, surface]))
  for (const surface of contract.surfaces) {
    const mapping = mappings.get(surface.id)
    assert.ok(mapping, `missing ${surface.id}`)
    assert.ok(mapping.desktopPath)
    assert.ok(mapping.mobilePath)
    for (const persona of surface.personas) {
      assert.ok(mapping.personas.includes(persona))
      assert.ok(packet.evidence[persona][surface.id])
    }
  }
})

test('buyer and seller use shared responsive navigation without weakening canonical routes', () => {
  assert.match(portalSource, /ClientPortalBottomNavigation/)
  assert.match(portalSource, /BuyerMobilePortal/)
  assert.match(portalSource, /SellerMobilePortal/)
  assert.match(foundationSource, /aria-current/)
})

test('parity requires desktop, mobile and same-data evidence', () => {
  for (const persona of Object.values(packet.evidence)) {
    for (const item of Object.values(persona)) {
      assert.deepEqual(Object.keys(item), ['desktopResult', 'mobileResult', 'sameDataResult', 'evidenceUrl'])
    }
  }
})

test('pending parity evidence fails closed', () => {
  const result = spawnSync(process.execPath, ['scripts/client-portal-launch-phase5d-capability-parity.mjs'], {
    cwd: new URL('.', root),
    encoding: 'utf8'
  })
  assert.equal(result.status, 0)
  const report = JSON.parse(result.stdout)
  assert.equal(report.decision, 'HOLD')
  assert.equal(report.requiredSurfaces, contract.surfaces.length)
  assert.ok(report.blockers.includes('mobileResult:buyer:overview'))
  assert.ok(report.blockers.includes('sameDataResult:seller:offers'))
})

test('enforced parity certification rejects incomplete comparisons', () => {
  const result = spawnSync(process.execPath, ['scripts/client-portal-launch-phase5d-capability-parity.mjs', '--enforce'], {
    cwd: new URL('.', root),
    encoding: 'utf8'
  })
  assert.notEqual(result.status, 0)
})
