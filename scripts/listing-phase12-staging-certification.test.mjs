import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const contract = JSON.parse(fs.readFileSync('config/listing-worker-phase12-staging-certification.json', 'utf8'))
const phase11 = JSON.parse(fs.readFileSync('config/listing-worker-phase11-syndication-rehearsal.json', 'utf8'))
const script = fs.readFileSync('scripts/listing-phase12-staging-certification.mjs', 'utf8')
const adapter = fs.readFileSync('the-it-guy/api/internal/listing-syndication-worker.js', 'utf8')

function run(env = {}, args = []) {
  return spawnSync(process.execPath, ['scripts/listing-phase12-staging-certification.mjs', ...args], {
    encoding: 'utf8', env: { ...process.env, ...env },
  })
}

const production = run({
  SUPABASE_STAGING_PROJECT_REF: contract.productionProjectRef,
  SUPABASE_STAGING_URL: `https://${contract.productionProjectRef}.supabase.co`,
})
assert.notEqual(production.status, 0)
assert.match(production.stderr, /Production project refused/)

const preflight = run({
  SUPABASE_STAGING_PROJECT_REF: contract.stagingProjectRef,
  SUPABASE_STAGING_URL: `https://${contract.stagingProjectRef}.supabase.co`,
})
assert.equal(preflight.status, 0)
assert.match(preflight.stdout, /STAGING_CERTIFICATION_(BLOCKED|PREFLIGHT_READY)/)
assert.match(preflight.stdout, /"productionEnabled": false/)

const unconfirmed = run({
  SUPABASE_STAGING_PROJECT_REF: contract.stagingProjectRef,
  SUPABASE_STAGING_URL: `https://${contract.stagingProjectRef}.supabase.co`,
}, ['--certify'])
assert.notEqual(unconfirmed.status, 0)
assert.match(unconfirmed.stderr, /--confirm must equal/)

assert.deepEqual(contract.requiredProviders, ['property24', 'private_property'])
assert.equal(contract.productionEnabled, false)
assert.equal(contract.scheduleEnabled, false)
assert.match(phase11.evidencePathTemplate, /\{provider\}/)
assert.match(script, /listing_media_variants/)
assert.match(script, /bridge_listing_syndication_health_v1/)
assert.match(script, /edgeResponse\.status !== 405/)
assert.match(script, /adapter\.productionEnabled !== false/)
assert.match(script, /createHash\('sha256'\)/)
assert.match(adapter, /request\.method === 'GET'/)
assert.match(adapter, /productionEnabled/)

console.log('listing Phase 12 staging certification tests passed')
