import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const script = fs.readFileSync('scripts/listing-phase8-production-canary.mjs', 'utf8')
const contract = JSON.parse(fs.readFileSync('config/listing-worker-phase8-production-canary.json', 'utf8'))

function run(env = {}, args = []) {
  return spawnSync(process.execPath, ['scripts/listing-phase8-production-canary.mjs', ...args], {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_PRODUCTION_SERVICE_ROLE_KEY: '', LISTING_JOB_RUNNER_SECRET: '', ...env },
  })
}

const staging = run({
  SUPABASE_PRODUCTION_PROJECT_REF: contract.stagingProjectRef,
  SUPABASE_PRODUCTION_URL: `https://${contract.stagingProjectRef}.supabase.co`,
})
assert.notEqual(staging.status, 0)
assert.match(staging.stderr, /approved production project/)

const mismatchedUrl = run({
  SUPABASE_PRODUCTION_PROJECT_REF: contract.productionProjectRef,
  SUPABASE_PRODUCTION_URL: `https://${contract.stagingProjectRef}.supabase.co`,
})
assert.notEqual(mismatchedUrl.status, 0)
assert.match(mismatchedUrl.stderr, /does not match/)

const preflight = run({
  SUPABASE_PRODUCTION_PROJECT_REF: contract.productionProjectRef,
  SUPABASE_PRODUCTION_URL: `https://${contract.productionProjectRef}.supabase.co`,
})
assert.equal(preflight.status, 0)
assert.match(preflight.stdout, /PRODUCTION_CANARY_(BLOCKED|PREFLIGHT_READY)/)

const unconfirmed = run({
  SUPABASE_PRODUCTION_PROJECT_REF: contract.productionProjectRef,
  SUPABASE_PRODUCTION_URL: `https://${contract.productionProjectRef}.supabase.co`,
}, ['--execute'])
assert.notEqual(unconfirmed.status, 0)
assert.match(unconfirmed.stderr, /--confirm must equal/)

assert.equal(contract.scheduleEnabled, false)
assert.equal(contract.batchLimit, 1)
assert.equal(contract.maxAttempts, 1)
assert.match(script, /Production queue must be idle/)
assert.match(script, /phase8_production_canary/)
assert.match(script, /complete exactly once/)
assert.doesNotMatch(script, /job_type:\s*['"](?:property24_publish|private_property_publish)/)

console.log('listing Phase 8 production canary tests passed')
