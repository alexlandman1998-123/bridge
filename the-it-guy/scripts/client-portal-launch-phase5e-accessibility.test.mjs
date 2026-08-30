import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const [packet, styles, foundation, resilience, brandMark] = await Promise.all([
  readFile(new URL('config/client-portal-launch-phase5e-accessibility.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('src/App.css', root), 'utf8'),
  readFile(new URL('src/components/client-portal/ClientPortalResponsiveFoundation.jsx', root), 'utf8'),
  readFile(new URL('src/components/client-portal/PortalResilienceStatus.jsx', root), 'utf8'),
  readFile(new URL('src/components/client-portal/AgencyBrandMark.jsx', root), 'utf8')
])

test('accessibility packet targets WCAG 2.2 AA for both personas', () => {
  assert.equal(packet.standard, 'WCAG 2.2 AA')
  assert.deepEqual(packet.personas, ['buyer', 'seller'])
  assert.match(packet.candidate.deploymentId, /^dpl_/)
})

test('manual evidence covers the complete launch accessibility boundary', () => {
  assert.deepEqual(Object.keys(packet.requiredChecks), [
    'keyboard', 'screenReader', 'contrast', 'touchTargets', 'zoomAndTextScaling', 'reducedMotion', 'errorsAndStatus'
  ])
  assert.deepEqual(packet.requiredChecks.screenReader.assistiveTechnologies, ['VoiceOver with Safari', 'TalkBack with Chrome'])
})

test('portal foundation exposes focus, motion, status and identity semantics', () => {
  assert.match(styles, /:focus-visible/)
  assert.match(styles, /prefers-reduced-motion: reduce/)
  assert.match(foundation, /aria-current/)
  assert.match(foundation, /role=\{state === 'error'/)
  assert.match(foundation, /aria-live=\{state === 'loading'/)
  assert.match(resilience, /role="status"/)
  assert.match(brandMark, /aria-label=/)
})

test('pending accessibility evidence and defects fail closed', () => {
  const result = spawnSync(process.execPath, ['scripts/client-portal-launch-phase5e-accessibility.mjs'], {
    cwd: new URL('.', root),
    encoding: 'utf8'
  })
  assert.equal(result.status, 0)
  const report = JSON.parse(result.stdout)
  assert.equal(report.decision, 'HOLD')
  assert.ok(report.blockers.includes('keyboard:buyerResult'))
  assert.ok(report.blockers.includes('screenReader:sellerResult'))
  assert.ok(report.blockers.includes('defects:openCritical'))
})

test('enforced accessibility certification rejects incomplete evidence', () => {
  const result = spawnSync(process.execPath, ['scripts/client-portal-launch-phase5e-accessibility.mjs', '--enforce'], {
    cwd: new URL('.', root),
    encoding: 'utf8'
  })
  assert.notEqual(result.status, 0)
})
