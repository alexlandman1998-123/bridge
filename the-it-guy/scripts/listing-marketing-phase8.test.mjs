import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('Marketing tab renders operational health from all four publication channels', async () => {
  const source = await readFile(path.join(appRoot, 'src/pages/AgentListingDetail.jsx'), 'utf8')
  assert.match(source, /buildListingMarketingOperationalHealth/)
  assert.match(source, /ListingMarketingOperationalHealthPanel/)
  for (const channel of ['property24', 'private_property', 'agency_website', 'arch9_catalogue']) {
    assert.match(source, new RegExp(`key: '${channel}'`), `${channel} must participate in operational health`)
  }
  assert.match(source, /refreshMarketingOperationalHealth/)
})

test('operational health detects drift and remains observational', async () => {
  const source = await readFile(path.join(appRoot, 'src/services/listings/listingMarketingOperationalHealth.js'), 'utf8')
  assert.match(source, /withdrawal_drift/)
  assert.match(source, /portal_inactive_drift/)
  assert.match(source, /publication_stuck/)
  assert.match(source, /activity_monitoring_unavailable/)
  assert.doesNotMatch(source, /fetch\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(/)
})

test('health panel exposes findings and an explicit refresh without automatic repair', async () => {
  const [component, model] = await Promise.all([
    readFile(path.join(appRoot, 'src/components/listings/ListingMarketingOperationalHealthPanel.jsx'), 'utf8'),
    readFile(path.join(appRoot, 'src/services/listings/listingMarketingOperationalHealth.js'), 'utf8'),
  ])
  assert.match(component, /listing-marketing-operational-health/)
  assert.match(component, /Refresh health/)
  assert.match(model, /'Action required'/)
  assert.doesNotMatch(component, /Publish|Withdraw|Repair/)
})

test('Phase 8 operating guide preserves the no-automation and no-production boundaries', async () => {
  const source = await readFile(path.join(appRoot, 'docs/listing-marketing-phase8-operational-monitoring.md'), 'utf8')
  assert.match(source, /never republishes, withdraws, or repairs/i)
  assert.match(source, /No automated alert delivery, production activation, deployment, or external portal mutation is authorised/i)
})
