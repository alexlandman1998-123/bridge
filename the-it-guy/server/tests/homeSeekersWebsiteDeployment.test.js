import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  HOME_SEEKERS_FUNCTIONS,
  HOME_SEEKERS_VERCEL_PROJECT,
  packageHomeSeekersWebsite,
} from '../../scripts/build-home-seekers-website.mjs'

const SITE_ID = 'c2fcb2e4-23c1-4302-b490-7332f5075669'
const ORG_ID = '2958d402-368e-43c9-b728-0098e10505f1'
const LISTING_ID = 'ffec99be-27f8-4bba-ae3f-76b37b4bd9c1'
const WEBSITE_HOST = 'www.homeseeker.co.za'
const REGISTERED_HOST = 'home-seekers-website-alpha.vercel.app'
const require = createRequire(import.meta.url)

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

test('the standalone website artifact serves its own CRM APIs', async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'home-seekers-deployment-'))
  const previousEnv = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WEBSITES_LEAD_FINGERPRINT_SECRET'].map((key) => [key, process.env[key]]))
  const rpcCalls = []
  const dispatchCalls = []
  const readQueries = []
  let publications = [{
    listing_id: LISTING_ID,
    publication_json: { title: 'Approved Home Seekers home', suburb: 'Moreleta Park', listing_type: 'Sale', asking_price: 2500000 },
    media_json: [{ media_type: 'image', file_url: 'https://example.test/home.jpg', sort_order: 0 }],
  }]
  const database = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    const table = url.pathname.split('/').at(-1)
    response.setHeader('Content-Type', 'application/json')
    if (request.method === 'POST') {
      if (url.pathname === '/functions/v1/website-lead-dispatcher') {
        dispatchCalls.push(await readBody(request))
        response.end(JSON.stringify({ dispatched: true }))
        return
      }
      rpcCalls.push({ name: table, body: await readBody(request) })
      response.end(JSON.stringify(table === 'website_record_analytics_event' ? null : { accepted: true, notificationEventId: '77777777-7777-4777-8777-777777777777' }))
      return
    }
    readQueries.push({ table, query: url.searchParams })
    const rows = {
      website_sites: [{ id: SITE_ID, organisation_id: ORG_ID, status: 'published', published_revision_id: '484c8537-9996-40e8-abc9-651d9058a10c' }],
      website_domains: [{ hostname: REGISTERED_HOST, status: 'active' }],
      website_listing_publications: publications,
      listing_publication_data: [{ listing_id: LISTING_ID }],
      website_pages: [{ id: '7a9ecb18-5864-4ef8-b06f-bc5502a0a515' }],
    }
    if (!Object.hasOwn(rows, table)) response.statusCode = 404
    response.end(JSON.stringify(rows[table] || { error: 'unexpected_fixture_request' }))
  })
  let website
  try {
    process.env.SUPABASE_URL = await listen(database)
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-server-key-never-public'
    process.env.WEBSITES_LEAD_FINGERPRINT_SECRET = 'fixture-fingerprint-secret-never-public'.repeat(2)
    const frontendDirectory = join(temporaryRoot, 'frontend')
    await mkdir(frontendDirectory)
    await writeFile(join(frontendDirectory, 'index.html'), '<!doctype html><title>Home Seekers fixture</title>')
    const deploymentRoot = join(temporaryRoot, 'deployment')
    const outputRoot = await packageHomeSeekersWebsite({ frontendDirectory, deploymentRoot })
    const config = JSON.parse(await readFile(join(outputRoot, 'config.json'), 'utf8'))
    const handlers = Object.fromEntries(HOME_SEEKERS_FUNCTIONS.map((name) => [
      `/api/home-seekers/${name}`,
      require(join(outputRoot, 'functions/api/home-seekers', `${name}.func/index.cjs`)),
    ]))
    website = createServer(async (request, response) => {
      try {
        const pathname = new URL(request.url, 'http://localhost').pathname
        if (handlers[pathname]) return await handlers[pathname](request, response)
        // Exercise the output's fallback rules after the filesystem misses.
        const fallback = config.routes.slice(config.routes.findIndex((route) => route.handle === 'filesystem') + 1)
          .find((route) => route.src && new RegExp(route.src).test(pathname))
        response.statusCode = fallback.status || 200
        response.setHeader('Content-Type', fallback.dest.endsWith('.json') ? 'application/json' : 'text/html')
        response.end(await readFile(join(outputRoot, 'static', fallback.dest)))
      } catch (error) {
        response.statusCode = 500
        response.end(JSON.stringify({ error: error.message }))
      }
    })
    const websiteUrl = await listen(website)
    // Use http.request so the fixture can send the actual public Host header;
    // Node's fetch client replaces it with the loopback transport hostname.
    const send = (path, body, host = WEBSITE_HOST) => new Promise((resolve, reject) => {
      const request = httpRequest(`${websiteUrl}${path}`, {
        method: 'POST',
        headers: { Host: host, Origin: `https://${host}`, 'Content-Type': 'application/json' },
      }, (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => resolve({
          status: response.statusCode,
          json: async () => JSON.parse(Buffer.concat(chunks).toString('utf8')),
        }))
        response.on('error', reject)
      })
      request.on('error', reject)
      request.end(JSON.stringify(body))
    })

    await t.test('only Home Seekers functions are bundled and project identity is fixed', async () => {
      assert.deepEqual((await readdir(join(outputRoot, 'functions/api'))), ['home-seekers'])
      assert.deepEqual((await readdir(join(outputRoot, 'functions/api/home-seekers'))).sort(), HOME_SEEKERS_FUNCTIONS.map((name) => `${name}.func`).sort())
      assert.deepEqual(JSON.parse(await readFile(join(deploymentRoot, '.vercel/project.json'), 'utf8')), HOME_SEEKERS_VERCEL_PROJECT)
      assert.equal(config.crons, undefined)
      for (const name of HOME_SEEKERS_FUNCTIONS) {
        const directory = join(outputRoot, 'functions/api/home-seekers', `${name}.func`)
        const runtime = JSON.parse(await readFile(join(directory, '.vc-config.json'), 'utf8'))
        assert.equal(runtime.runtime, 'nodejs24.x')
        assert.equal(runtime.environment, undefined)
        const bundled = await readFile(join(directory, 'index.cjs'), 'utf8')
        assert.ok(!bundled.includes(process.env.SUPABASE_SERVICE_ROLE_KEY))
        assert.ok(!bundled.includes(process.env.WEBSITES_LEAD_FINGERPRINT_SECRET))
        assert.ok(!bundled.includes('getMissionControlSnapshot'))
      }
      assert.equal(config.routes[0].headers.Location, '/demo/homeseekers')
    })

    await t.test('listing feed returns approved, organisation-scoped JSON', async () => {
      const response = await fetch(`${websiteUrl}/api/home-seekers/site`)
      assert.equal(response.status, 200)
      assert.match(response.headers.get('content-type'), /application\/json/)
      assert.deepEqual((await response.json()).listings.map((listing) => listing.id), [LISTING_ID])
      assert.equal(readQueries.find((row) => row.table === 'website_sites').query.get('organisation_id'), `eq.${ORG_ID}`)
      assert.equal(readQueries.find((row) => row.table === 'website_listing_publications').query.get('website_site_id'), `eq.${SITE_ID}`)
      assert.equal(readQueries.find((row) => row.table === 'listing_publication_data').query.get('private_listings.organisation_id'), `eq.${ORG_ID}`)
      publications = []
      assert.deepEqual(await (await fetch(`${websiteUrl}/api/home-seekers/site`)).json(), { listings: [] })
    })

    await t.test('property and valuation enquiries work on the standalone or future custom host', async () => {
      for (const [host, type, path] of [
        [REGISTERED_HOST, 'general_enquiry', '/demo/homeseekers/contact'],
        [WEBSITE_HOST, 'valuation_request', '/demo/homeseekers/selling'],
        [WEBSITE_HOST, 'property_enquiry', `/demo/homeseekers/buying/${LISTING_ID}`],
      ]) {
        const response = await send('/api/home-seekers/leads', {
          type, name: 'Fixture Visitor', email: 'visitor@example.test', privacyAccepted: true,
          idempotencyKey: `fixture-${type}-1234567890`, pageUrl: `https://${host}${path}`,
          ...(type === 'property_enquiry' ? { listingId: LISTING_ID } : {}),
        }, host)
        assert.equal(response.status, 201)
        assert.equal((await response.json()).accepted, true)
        const capture = rpcCalls.at(-1)
        assert.equal(capture.name, 'website_capture_lead_submission')
        assert.equal(capture.body.p_hostname, REGISTERED_HOST)
        assert.equal(capture.body.p_attribution.pagePath, path)
      }
      const callCount = rpcCalls.length
      assert.equal(dispatchCalls.length, 3)
      assert.ok(dispatchCalls.every((call) => Object.keys(call).length === 1 && call.eventId === '77777777-7777-4777-8777-777777777777'))
      const rejected = await send('/api/home-seekers/leads', {
        type: 'general_enquiry', name: 'Fixture Visitor', email: 'visitor@example.test', privacyAccepted: true,
        idempotencyKey: 'fixture-rejected-1234567890', pageUrl: 'https://other.example/demo/homeseekers/contact',
      })
      assert.equal(rejected.status, 400)
      assert.equal(rpcCalls.length, callCount)
    })

    await t.test('malformed and oversized lead requests fail before CRM access', async () => {
      const count = rpcCalls.length
      for (const [body, status] of [['{broken', 400], [JSON.stringify({ message: 'x'.repeat(17000) }), 413], ['[]', 400]]) {
        const result = await fetch(`${websiteUrl}/api/home-seekers/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        assert.equal(result.status, status)
        assert.match(result.headers.get('content-type'), /application\/json/)
      }
      assert.equal(rpcCalls.length, count)
    })

    await t.test('existing analytics and recruitment endpoints remain callable', async () => {
      const analytics = await send('/api/home-seekers/analytics', { eventType: 'page_view', path: '/demo/homeseekers' })
      assert.equal(analytics.status, 204)
      assert.equal(rpcCalls.at(-1).name, 'website_record_analytics_event')
      const application = await send('/api/home-seekers/applications', {
        name: 'Fixture Agent', email: 'agent@example.test', phone: '0820000000', area: 'Pretoria', sales: 4,
        message: 'Fixture application', privacyAccepted: true, idempotencyKey: 'fixture-application-1234567890',
        pageUrl: `https://${WEBSITE_HOST}/demo/homeseekers/join`,
      })
      assert.equal(application.status, 201)
      assert.equal(rpcCalls.at(-1).name, 'home_seekers_capture_application')
    })

    await t.test('unknown APIs never fall through to the webpage', async () => {
      for (const path of ['/api/home-seekers/missing', '/api/cron/private-property-event-reconciliation']) {
        const response = await fetch(`${websiteUrl}${path}`)
        assert.equal(response.status, 404)
        assert.deepEqual(await response.json(), { error: 'not_found' })
      }
      const page = await fetch(`${websiteUrl}/demo/homeseekers/buying`)
      assert.equal(page.status, 200)
      assert.match(await page.text(), /Home Seekers fixture/)
      assert.equal((await fetch(`${websiteUrl}/agency/dashboard`)).status, 404)
    })

    await t.test('unsupported methods and missing server configuration fail explicitly', async () => {
      const wrongMethod = await fetch(`${websiteUrl}/api/home-seekers/leads`)
      assert.equal(wrongMethod.status, 405)
      assert.deepEqual(await wrongMethod.json(), { error: 'method_not_allowed' })
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      const unavailable = await fetch(`${websiteUrl}/api/home-seekers/site`)
      assert.equal(unavailable.status, 503)
      assert.deepEqual(await unavailable.json(), { error: 'Website listings are temporarily unavailable.' })
    })
  } finally {
    if (website) await new Promise((resolve) => website.close(resolve))
    await new Promise((resolve) => database.close(resolve))
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
