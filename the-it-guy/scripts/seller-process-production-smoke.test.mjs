import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const smokeSource = readFileSync(resolve(appRoot, 'scripts/seller-process-production-smoke.mjs'), 'utf8')

{
  assert.equal(
    packageJson.scripts?.['smoke:seller-process-production'],
    'node --env-file=.env --env-file=.env.staging.local scripts/seller-process-production-smoke.mjs',
  )
  assert.equal(
    packageJson.scripts?.['test:seller-process-production-smoke'],
    'node scripts/seller-process-production-smoke.test.mjs',
  )
}

{
  assert.match(smokeSource, /DEFAULT_APP_URL = 'https:\/\/app\.arch9\.co\.za'/)
  assert.match(smokeSource, /release-manifest\.json/)
  assert.match(smokeSource, /KINGSTON_SELLER_PROCESS_SMOKE_EXPECTED_RELEASE_ID/)
  assert.match(smokeSource, /KINGSTON_SELLER_PROCESS_SMOKE_KINGSTON_LEAD_ID/)
  assert.match(smokeSource, /KINGSTON_SELLER_PROCESS_SMOKE_CONTROL_LEAD_ID/)
  assert.match(smokeSource, /A non-Kingston control lead is required/)
  assert.match(smokeSource, /--allow-kingston-only/)
}

{
  assert.match(smokeSource, /KINGSTONS SELLER PROCESS/)
  assert.match(smokeSource, /SELLER JOURNEY/)
  assert.match(smokeSource, /Schedule Valuation Appointment/)
  assert.match(smokeSource, /Formal Valuation/)
  assert.match(smokeSource, /Valuation Presentation/)
  assert.match(smokeSource, /assertKingstonRail/)
  assert.match(smokeSource, /assertDefaultRail/)
}

{
  assert.match(smokeSource, /mutatedData:\s*false/)
  assert.doesNotMatch(smokeSource, /\.from\(/)
  assert.doesNotMatch(smokeSource, /\.insert\(/)
  assert.doesNotMatch(smokeSource, /\.update\(/)
  assert.doesNotMatch(smokeSource, /\.upsert\(/)
  assert.doesNotMatch(smokeSource, /\.delete\(/)
  assert.doesNotMatch(smokeSource, /POST|PATCH|PUT|DELETE/)
}

console.log('seller process production smoke contract passed')
