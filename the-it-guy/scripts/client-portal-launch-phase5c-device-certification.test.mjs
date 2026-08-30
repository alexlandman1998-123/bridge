import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const packet = JSON.parse(await readFile(new URL('config/client-portal-launch-phase5c-device-certification.json', root), 'utf8'))

test('device packet binds testing to the immutable preview candidate', () => {
  assert.match(packet.candidate.commit, /^[a-f0-9]{40}$/)
  assert.match(packet.candidate.deploymentId, /^dpl_/)
  assert.match(packet.candidate.url, /^https:\/\//)
})

test('both physical platforms must test buyer and seller portals', () => {
  assert.deepEqual(Object.keys(packet.devices), ['ios', 'android'])
  assert.equal(packet.devices.ios.browser, 'Safari')
  assert.equal(packet.devices.android.browser, 'Chrome')
  for (const device of Object.values(packet.devices)) {
    assert.equal(device.required, true)
    assert.ok('buyerResult' in device)
    assert.ok('sellerResult' in device)
  }
})

test('device script covers primary mobile risks', () => {
  for (const check of ['secure-access', 'navigation', 'documents', 'offline-and-recovery', 'rotation-and-safe-areas', 'text-scaling', 'no-horizontal-overflow']) {
    assert.ok(packet.requiredChecks.includes(check))
  }
})

test('incomplete physical evidence fails closed', () => {
  const result = spawnSync(process.execPath, ['scripts/client-portal-launch-phase5c-device-certification.mjs'], {
    cwd: new URL('.', root),
    encoding: 'utf8'
  })
  assert.equal(result.status, 0)
  const report = JSON.parse(result.stdout)
  assert.equal(report.decision, 'HOLD')
  assert.ok(report.blockers.includes('ios:device'))
  assert.ok(report.blockers.includes('android:device'))
})

test('enforced certification rejects pending device results', () => {
  const result = spawnSync(process.execPath, ['scripts/client-portal-launch-phase5c-device-certification.mjs', '--enforce'], {
    cwd: new URL('.', root),
    encoding: 'utf8'
  })
  assert.notEqual(result.status, 0)
})
