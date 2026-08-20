import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createProperty24LeadSyncResponse } from '../server/property24/index.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const routeSource = read('api/property24/leads/sync.js')
const serverSource = read('server/property24/leadSyncApi.js')
const vercelConfig = JSON.parse(read('vercel.json'))
const packageJson = JSON.parse(read('package.json'))
const rootPackageJson = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

assert.match(routeSource, /createProperty24LeadSyncResponse/)
assert.match(routeSource, /readNodeRequestBody/)
assert.match(routeSource, /writeNodeJsonResponse/)

assert.match(serverSource, /PROPERTY24_LEAD_SYNC_CRON_SECRET/)
assert.match(serverSource, /CRON_SECRET/)
assert.match(serverSource, /PROPERTY24_API_INTERNAL_TOKEN/)
assert.match(serverSource, /applyLeads: !dryRun/)
assert.match(serverSource, /createProperty24ApiResponse/)
assert.match(serverSource, /\/api\/property24\/leads\/pull/)

assert.ok(
  vercelConfig.crons.some((cron) => cron.path === '/api/property24/leads/sync' && cron.schedule === '0 * * * *'),
  'Vercel cron must call the Property24 lead sync endpoint hourly.',
)

assert.equal(packageJson.scripts['property24:lead-sync'], 'node scripts/property24-pull-leads.mjs --apply')
assert.equal(packageJson.scripts['test:property24-phase9-lead-sync-ops'], 'node scripts/property24-phase9-lead-sync-ops.test.mjs')
assert.equal(rootPackageJson.scripts['property24:lead-sync'], 'npm --prefix the-it-guy run property24:lead-sync --')
assert.equal(rootPackageJson.scripts['test:property24-phase9-lead-sync-ops'], 'npm --prefix the-it-guy run test:property24-phase9-lead-sync-ops --')

const unauthorized = await createProperty24LeadSyncResponse({
  method: 'GET',
  url: '/api/property24/leads/sync',
  headers: { authorization: 'Bearer wrong' },
  env: {
    PROPERTY24_API_INTERNAL_TOKEN: 'internal-token',
    PROPERTY24_LEAD_SYNC_CRON_SECRET: 'cron-secret',
  },
})
assert.equal(unauthorized.status, 401)

let delegatedPayload = null
const dryRun = await createProperty24LeadSyncResponse({
  method: 'GET',
  url: '/api/property24/leads/sync?dryRun=true&agencyId=31382&after=2026-08-19T00:00:00.000Z',
  headers: { authorization: 'Bearer cron-secret', host: 'app.arch9.co.za' },
  env: {
    PROPERTY24_API_INTERNAL_TOKEN: 'internal-token',
    PROPERTY24_LEAD_SYNC_CRON_SECRET: 'cron-secret',
    PROPERTY24_SYNDICATION_ENABLED: 'true',
  },
  dependencies: {
    createProperty24ApiResponse: async ({ method, url, headers, body }) => {
      delegatedPayload = { method, url, headers, body: JSON.parse(body) }
      return {
        status: 200,
        body: {
          route: 'pullLeads',
          leads: { mode: 'DRY_RUN', summary: { receivedCount: 0 } },
        },
      }
    },
  },
})
assert.equal(dryRun.status, 200)
assert.equal(dryRun.body.mode, 'DRY_RUN')
assert.equal(delegatedPayload.method, 'POST')
assert.equal(delegatedPayload.url, '/api/property24/leads/pull')
assert.equal(delegatedPayload.headers['x-property24-api-token'], 'internal-token')
assert.equal(delegatedPayload.body.applyLeads, false)
assert.equal(delegatedPayload.body.agencyId, '31382')
assert.equal(delegatedPayload.body.after, '2026-08-19T00:00:00.000Z')

delegatedPayload = null
const scheduledApply = await createProperty24LeadSyncResponse({
  method: 'GET',
  url: '/api/property24/leads/sync',
  headers: { authorization: 'Bearer cron-secret' },
  env: {
    PROPERTY24_API_INTERNAL_TOKEN: 'internal-token',
    PROPERTY24_LEAD_SYNC_CRON_SECRET: 'cron-secret',
  },
  dependencies: {
    createProperty24ApiResponse: async ({ body }) => {
      delegatedPayload = JSON.parse(body)
      return {
        status: 200,
        body: {
          route: 'pullLeads',
          leads: { mode: 'APPLIED', import: { summary: { importedCount: 1 } } },
        },
      }
    },
  },
})
assert.equal(scheduledApply.status, 200)
assert.equal(scheduledApply.body.mode, 'APPLY')
assert.equal(delegatedPayload.applyLeads, true)

console.log('Property24 phase 9 lead sync ops contract passed')
