import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  HOME_SEEKERS_FUNCTIONS,
  HOME_SEEKERS_VERCEL_PROJECT,
  buildHomeSeekersFrontend,
  packageHomeSeekersWebsite,
} from '../../scripts/build-home-seekers-website.mjs'

import { validProfile } from '../../src/pages/recruitment/__tests__/helpers/recruitmentProfileFixture.js'

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
  const previousEnv = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WEBSITES_LEAD_FINGERPRINT_SECRET', 'HOME_SEEKERS_RECRUITMENT_INTAKE_TOKEN'].map((key) => [key, process.env[key]]))
  const rpcCalls = []
  const dispatchCalls = []
  const verificationEmails = []
  const readQueries = []
  const applicantAccounts = new Map()
  const applicantSessions = new Map()
  const authRequests = []
  const resumedApplicant = {emailVerification:'verified',stage:'lead_received',applicationSubmitted:false,contactSubmissionKey:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',contact:{firstName:'Fixture',lastName:'Applicant',email:'applicant@example.test',phone:'+27821234567'}}
  let fixtureApplicant = resumedApplicant
  let accountCreations = 0
  let publications = [{
    listing_id: LISTING_ID,
    publication_json: { title: 'Approved Home Seekers home', suburb: 'Moreleta Park', listing_type: 'Sale', asking_price: 2500000 },
    media_json: [{ media_type: 'image', file_url: 'https://example.test/home.jpg', sort_order: 0 }],
  }]
  const database = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    const table = url.pathname.split('/').at(-1)
    response.setHeader('Content-Type', 'application/json')
    if (['/auth/v1/otp','/auth/v1/verify','/auth/v1/token','/auth/v1/user'].includes(url.pathname)) {
      const body = request.method === 'POST' ? await readBody(request) : {}
      authRequests.push({path:url.pathname,body})
      if (url.pathname === '/auth/v1/otp') {
        assert.equal(body.create_user,false)
        response.end(JSON.stringify({})); return
      }
      const user = [...applicantAccounts.values()][0]
      if (url.pathname === '/auth/v1/verify' && body.token !== '123456') {
        response.statusCode=403; response.end(JSON.stringify({code:'otp_expired',msg:'Token has expired'})); return
      }
      user.email_confirmed_at='2026-10-07T08:00:00Z'
      if (url.pathname === '/auth/v1/user') response.end(JSON.stringify(user))
      else response.end(JSON.stringify({access_token:'fixture-access-token',refresh_token:'fixture-refresh-token',expires_in:3600,token_type:'bearer',user}))
      return
    }
    if (url.pathname.startsWith('/auth/v1/admin/users')) {
      if (request.method === 'POST') {
        const user = await readBody(request)
        if ([...applicantAccounts.values()].some(account => account.email === user.email)) {
          response.statusCode = 422
          response.end(JSON.stringify({ error_code: 'email_exists', message: 'Email already registered' }))
          return
        }
        assert.equal(user.email_confirm, false)
        assert.equal(user.password, 'FixturePassword123')
        assert.equal(user.app_metadata.recruitment_organisation_id, ORG_ID)
        // Store only the synthetic user acknowledgement, never its password.
        const saved = { id: user.id, email: user.email, app_metadata: user.app_metadata }
        applicantAccounts.set(saved.id, saved); accountCreations += 1
        response.end(JSON.stringify(saved))
      } else {
        const user = applicantAccounts.get(table)
        response.statusCode = user ? 200 : 404
        response.end(JSON.stringify(user || { code: 'user_not_found', message: 'User not found' }))
      }
      return
    }
    if (request.method === 'POST') {
      if (url.pathname === '/functions/v1/send-email') {
        assert.equal(request.headers.authorization, 'Bearer fixture-server-key-never-public')
        verificationEmails.push(await readBody(request))
        response.end(JSON.stringify({ verificationRequested: true, codeLength: 8 }))
        return
      }
      if (url.pathname === '/functions/v1/website-lead-dispatcher') {
        dispatchCalls.push(await readBody(request))
        response.end(JSON.stringify({ dispatched: true }))
        return
      }
      rpcCalls.push({ name: table, body: await readBody(request) })
      const args=rpcCalls.at(-1).body
      if (table === 'recruitment_capture_contact') {
        resumedApplicant.contactSubmissionKey=args.p_submission_key
        fixtureApplicant.contactSubmissionKey=args.p_submission_key
      }
      if (table === 'recruitment_auth_budget') { response.end('true'); return }
      if (table === 'recruitment_open_applicant_session') {
        assert.equal(args.p_organisation_id,ORG_ID)
        assert.equal(args.p_user_id,[...applicantAccounts.values()][0].id)
        assert.match(args.p_token_hash,/^[a-f0-9]{64}$/)
        if (args.p_submission_key) assert.equal(args.p_submission_key,resumedApplicant.contactSubmissionKey)
        applicantSessions.set(args.p_token_hash,fixtureApplicant)
        response.end('true'); return
      }
      if (table === 'recruitment_resume_applicant') { response.end(JSON.stringify(args.p_organisation_id===ORG_ID?applicantSessions.get(args.p_token_hash)||null:null)); return }
      if (table === 'recruitment_save_profile') {
        assert.equal(args.p_organisation_id,ORG_ID)
        const current = applicantSessions.get(args.p_token_hash)
        if (!current) { response.end(JSON.stringify({unavailable:true})); return }
        if (args.p_revision !== (current.profileRevision || 0)) { response.end(JSON.stringify({conflict:true})); return }
        const applicant = {...current,profile:{version:'recruitment-profile-v1',country:'ZA',answers:args.p_answers,page:args.p_intent==='continue'?Math.min(args.p_page+1,3):args.p_page,complete:args.p_intent==='complete'},profileRevision:args.p_revision+1,profileSavedAt:'2026-10-07T09:00:00Z'}
        fixtureApplicant=applicant
        for (const hash of applicantSessions.keys()) applicantSessions.set(hash,applicant)
        response.end(JSON.stringify({saved:true,applicant})); return
      }
      if (table === 'recruitment_submit_verified_profile') {
        assert.equal(args.p_organisation_id,ORG_ID)
        const current=applicantSessions.get(args.p_token_hash)
        if (!current) {response.end(JSON.stringify({unavailable:true}));return}
        if (current.applicationSubmitted) {response.end(JSON.stringify({accepted:true,duplicate:true,applicant:current}));return}
        if (args.p_revision !== current.profileRevision) {response.end(JSON.stringify({conflict:true}));return}
        assert.equal(args.p_privacy_accepted,true);assert.equal(args.p_declaration_accepted,true)
        fixtureApplicant={...current,stage:'application_submitted',applicationSubmitted:true,applicationSubmittedAt:'2026-10-07T10:00:00Z',submittedApplication:{answers:current.profile.answers,submittedAt:'2026-10-07T10:00:00Z',consentVersion:'recruitment-submission-v1'}}
        for (const hash of applicantSessions.keys()) applicantSessions.set(hash,fixtureApplicant)
        response.end(JSON.stringify({accepted:true,duplicate:false,applicant:fixtureApplicant}));return
      }
      if (table === 'recruitment_end_applicant_session') { applicantSessions.delete(args.p_token_hash); response.end('null'); return }

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
      recruitment_intake_links: [{ id: 'c7f2c758-74fb-4b0f-b5a7-950732de0404', organisation_id: ORG_ID, channel: 'website', expires_at: '2099-10-07' }],
      recruitment_leads: [{id:'743f9651-330f-4c1a-909d-14c0e1e17092'}],
      recruitment_contact_receipts: [{ lead_id: '743f9651-330f-4c1a-909d-14c0e1e17092', submission_key: resumedApplicant.contactSubmissionKey }],
      recruitment_applicant_sessions: applicantSessions.has(String(url.searchParams.get('token_hash') || '').slice(3)) ? [{ lead_id: '743f9651-330f-4c1a-909d-14c0e1e17092' }] : [],
      organisation_branding: [{ organisation_display_name: 'Home Seekers' }],
      organisations: [{ name: 'Home Seekers' }],
    }
    if (!Object.hasOwn(rows, table)) response.statusCode = 404
    response.end(JSON.stringify(rows[table] || { error: 'unexpected_fixture_request' }))
  })
  let website
  try {
    process.env.SUPABASE_URL = await listen(database)
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-server-key-never-public'
    process.env.WEBSITES_LEAD_FINGERPRINT_SECRET = 'fixture-fingerprint-secret-never-public'.repeat(2)
    process.env.HOME_SEEKERS_RECRUITMENT_INTAKE_TOKEN = 'a'.repeat(64)
    const frontendDirectory = join(temporaryRoot, 'frontend')
    const frontendBuild = await buildHomeSeekersFrontend(frontendDirectory)
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
    const send = (path, body, host = WEBSITE_HOST, extraHeaders = {}) => new Promise((resolve, reject) => {
      const request = httpRequest(`${websiteUrl}${path}`, {
        method: 'POST',
        headers: { Host: host, Origin: `https://${host}`, 'Content-Type': 'application/json', ...extraHeaders },
      }, (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => resolve({
          status: response.statusCode,
          headers: response.headers,
          json: async () => JSON.parse(Buffer.concat(chunks).toString('utf8')),
        }))
        response.on('error', reject)
      })
      request.on('error', reject)
      request.end(JSON.stringify(body))
    })

    await t.test('the actual public frontend includes recruitment without the private CRM or credentials', async () => {
      const chunks = frontendBuild.output.filter((item) => item.type === 'chunk')
      const modules = chunks.flatMap((chunk) => Object.keys(chunk.modules)).join('\n')
      assert.match(modules, /src\/pages\/HomeSeekersJoin\.jsx/)
      assert.match(modules, /RecruitmentSignupModal\.jsx/)
      assert.match(modules, /RecruitmentProfileQuestionnaire\.jsx/)
      assert.match(modules, /RecruitmentProfileReview\.jsx/)
      assert.doesNotMatch(modules, /src\/App\.jsx|AuthSessionContext|RecruitmentPage\.jsx|node_modules\/@supabase\//)
      const html = await readFile(join(outputRoot, 'static/index.html'), 'utf8')
      assert.match(html, /<title>Home Seekers<\/title>/)
      assert.match(html, /type="module"[^>]*src="\/assets\//)
      assert.doesNotMatch(html, /%VITE_|\/src\//)
      for (const chunk of chunks) {
        for (const secret of Object.values(previousEnv).filter(Boolean).concat([
          process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.WEBSITES_LEAD_FINGERPRINT_SECRET,
          process.env.HOME_SEEKERS_RECRUITMENT_INTAKE_TOKEN,
        ])) assert.ok(!chunk.code.includes(secret))
      }
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
        assert.ok(!bundled.includes(process.env.HOME_SEEKERS_RECRUITMENT_INTAKE_TOKEN))
        assert.ok(!bundled.includes('getMissionControlSnapshot'))
      }
      assert.ok(!config.routes.some((route) => route.src === '^/$' && route.headers?.Location))
    })

    await t.test('a hosted preview blocks every write before CRM or Auth access', async () => {
      const oldEnvironment = process.env.VERCEL_ENV
      const before = { rpc: rpcCalls.length, dispatch: dispatchCalls.length, reads: readQueries.length, auth: authRequests.length, accounts: accountCreations }
      process.env.VERCEL_ENV = 'preview'
      try {
        const context = await send('/api/home-seekers/recruitment', { action: 'context', preview: false })
        assert.deepEqual(await context.json(), { preview: true, branding: { organisationName: 'Home Seekers' }, verificationMethod: 'email_code' })
        for (const action of ['signup', 'send_verification', 'verify_email', 'sign_in', 'resume', 'sign_out', 'save_profile', 'submit_profile']) {
          assert.equal((await send('/api/home-seekers/recruitment', { action, preview: false })).status, 503)
        }
        assert.equal((await send('/api/home-seekers/leads', {})).status, 503)
        assert.equal((await send('/api/home-seekers/applications', {})).status, 503)
        assert.equal((await send('/api/home-seekers/analytics', { eventType: 'page_view', path: '/demo/homeseekers' })).status, 204)
        assert.deepEqual({ rpc: rpcCalls.length, dispatch: dispatchCalls.length, reads: readQueries.length, auth: authRequests.length, accounts: accountCreations }, before)
      } finally {
        if (oldEnvironment === undefined) delete process.env.VERCEL_ENV
        else process.env.VERCEL_ENV = oldEnvironment
      }
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
        [WEBSITE_HOST, 'general_enquiry', '/contact'],
        [WEBSITE_HOST, 'valuation_request', '/selling'],
        [WEBSITE_HOST, 'property_enquiry', `/properties/${LISTING_ID}`],
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
      assert.equal(dispatchCalls.length, 6)
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
      for (const [eventType, path, storedPath] of [['page_view', '/buying', '/buying'], ['guarantee_opened', '/join', '/demo/homeseekers/join']]) {
        assert.equal((await send('/api/home-seekers/analytics', { eventType, path })).status, 204)
        assert.equal(rpcCalls.at(-1).name, 'website_record_analytics_event')
        assert.equal(rpcCalls.at(-1).body.p_page_path, storedPath)
      }
      const application = await send('/api/home-seekers/applications', {
        name: 'Fixture Agent', email: 'agent@example.test', phone: '0820000000', area: 'Pretoria', sales: 4,
        message: 'Fixture application', privacyAccepted: true, idempotencyKey: 'fixture-application-1234567890',
        pageUrl: `https://${WEBSITE_HOST}/join`,
      })
      assert.equal(application.status, 201)
      assert.equal(rpcCalls.at(-1).name, 'home_seekers_capture_application')
    })

    await t.test('the packaged signup endpoint saves contact then creates an unverified applicant and recovers retries', async () => {
      const context = await send('/api/home-seekers/recruitment', { action: 'context', token: 'forged' })
      assert.equal(context.status, 200)
      assert.equal((await context.json()).verificationMethod, 'email_code')
      const details = { action: 'signup', submissionKey: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', password: 'FixturePassword123',
        contact: { firstName: 'Fixture', lastName: 'Applicant', email: 'applicant@example.test', phone: '+27821234567', privacyAccepted: true },
        organisationId: 'forged' }
      const first = await send('/api/home-seekers/recruitment', details)
      assert.equal(first.status, 201)
      assert.deepEqual(await first.json(), { accepted: true, contactAccepted: true, accountCreated: true, verificationRequired: true, duplicate: false, stage: 'lead_received', emailVerification: 'pending' })
      assert.equal(rpcCalls.at(-1).name, 'recruitment_capture_contact')
      assert.ok(!JSON.stringify(rpcCalls.at(-1)).includes('password'))
      const retry = await send('/api/home-seekers/recruitment', details)
      assert.equal(retry.status, 202)
      assert.equal((await retry.json()).duplicate, true)
      assert.equal(accountCreations, 1)
      assert.equal(readQueries.find(row => row.table === 'recruitment_contact_receipts').query.get('organisation_id'), `eq.${ORG_ID}`)
      const malformed = await fetch(`${websiteUrl}/api/home-seekers/recruitment`, { method: 'POST', body: '{broken' })
      assert.equal(malformed.status, 400)
      const oversized = await fetch(`${websiteUrl}/api/home-seekers/recruitment`, { method: 'POST', body: JSON.stringify({ password: 'x'.repeat(16001) }) })
      assert.equal(oversized.status, 413)
    })

    await t.test('packaged verification, existing-account sign-in and scoped cookies resume the saved enquiry', async () => {
      const path='/api/home-seekers/recruitment', email='applicant@example.test'
      const sent=await send(path,{action:'send_verification',email})
      assert.equal(sent.status,202); assert.equal((await sent.json()).verificationRequested,true)
      assert.deepEqual(verificationEmails.at(-1), { type: 'home_seekers_recruitment_code', leadId: '743f9651-330f-4c1a-909d-14c0e1e17092' })
      assert.ok(!authRequests.some(row => row.path === '/auth/v1/otp'))
      const invalid=await send(path,{action:'verify_email',email,code:'654321'})
      assert.equal(invalid.status,401); assert.equal(invalid.headers['set-cookie'],undefined)
      const verified=await send(path,{action:'verify_email',email,code:'123456',userId:'forged',emailVerified:true})
      assert.equal(verified.status,200)
      assert.deepEqual(await verified.json(),{applicant:resumedApplicant})
      const cookie=verified.headers['set-cookie'][0]
      assert.match(cookie,/HttpOnly; SameSite=Lax; Max-Age=604800; Secure$/)
      const header={Cookie:cookie.split(';')[0]}
      assert.deepEqual(await (await send(path,{action:'resume'},WEBSITE_HOST,header)).json(),{applicant:resumedApplicant})
      const restored=await send(path,{action:'context'},WEBSITE_HOST,header)
      assert.deepEqual((await restored.json()).applicant,resumedApplicant)
      assert.deepEqual(await (await send(path,{action:'resume'})).json(),{applicant:null})
      const signedOut=await send(path,{action:'sign_out'},WEBSITE_HOST,header)
      assert.equal((await signedOut.json()).signedOut,true)
      assert.match(signedOut.headers['set-cookie'][0],/Max-Age=0/)
      assert.deepEqual(await (await send(path,{action:'resume'},WEBSITE_HOST,header)).json(),{applicant:null})
      const existing=await send(path,{action:'sign_in',email,password:'FixturePassword123'})
      assert.equal(existing.status,200)
      assert.equal(accountCreations,1)
      assert.ok(authRequests.some(row=>row.path==='/auth/v1/user'))
      assert.ok(!JSON.stringify(rpcCalls).includes('FixturePassword123'))
      assert.ok(!JSON.stringify(await existing.json()).includes('fixture-access-token'))
    })

    await t.test('the packaged questionnaire saves and resumes a verified draft without submitting the application', async () => {
      const path='/api/home-seekers/recruitment'
      const signedIn=await send(path,{action:'sign_in',email:resumedApplicant.contact.email,password:'FixturePassword123'})
      assert.equal(signedIn.status,200)
      const headers={Cookie:signedIn.headers['set-cookie'][0].split(';')[0]}
      const answers={...validProfile(resumedApplicant.contact.email),packagePreference:'decide_later'}
      const response=await send(path,{action:'save_profile',answers:{...answers,password:'must-not-enter-the-CRM'},revision:0,page:3,intent:'complete',organisationId:'forged',leadId:'forged'},WEBSITE_HOST,headers)
      assert.equal(response.status,200)
      const result=await response.json()
      assert.equal(result.saved,true)
      assert.equal(result.applicant.profile.complete,true)
      assert.equal(result.applicant.profileRevision,1)
      assert.equal(result.applicant.stage,'lead_received')
      assert.equal(result.applicant.applicationSubmitted,false)
      assert.deepEqual(result.applicant.contact,resumedApplicant.contact)
      assert.deepEqual(result.applicant.profile.answers,answers)
      const call=rpcCalls.at(-1)
      assert.equal(call.name,'recruitment_save_profile')
      assert.equal(call.body.p_organisation_id,ORG_ID)
      assert.equal(call.body.p_lead_id,undefined)
      assert.equal(call.body.p_answers.password,undefined)
      const restored=await send(path,{action:'context'},WEBSITE_HOST,headers)
      assert.deepEqual((await restored.json()).applicant,result.applicant)
      const count=rpcCalls.length
      assert.equal((await send(path,{action:'save_profile',answers:{...answers,propertiesSold:'1000'},revision:1,page:3,intent:'complete'},WEBSITE_HOST,headers)).status,422)
      assert.equal((await send(path,{action:'save_profile',answers,revision:1,page:3,intent:'complete'})).status,401)
      assert.equal(rpcCalls.length,count)
      const conflict=await send(path,{action:'save_profile',answers:{...answers,city:'Johannesburg'},revision:0,page:3,intent:'complete'},WEBSITE_HOST,headers)
      assert.equal(conflict.status,409)
      assert.equal((await conflict.json()).conflict,true)
    })

    await t.test('the packaged Home Seekers flow re-verifies the original receipt and restores its saved draft', async () => {
      const path='/api/home-seekers/recruitment', email=resumedApplicant.contact.email
      const signedIn=await send(path,{action:'verify_email',email,code:'123456',submissionKey:resumedApplicant.contactSubmissionKey})
      assert.equal(signedIn.status,200)
      const saved=(await signedIn.json()).applicant
      assert.equal(saved.contactSubmissionKey,resumedApplicant.contactSubmissionKey)
      const headers={Cookie:signedIn.headers['set-cookie'][0].split(';')[0]}
      await send(path,{action:'sign_out'},WEBSITE_HOST,headers)
      assert.equal((await send(path,{action:'save_profile',answers:saved.profile.answers,page:3,revision:1,intent:'complete'},WEBSITE_HOST,headers)).status,401)
      const requested=await send(path,{action:'send_verification',email,submissionKey:saved.contactSubmissionKey})
      assert.equal(requested.status,202)
      const reopened=await send(path,{action:'verify_email',email,code:'123456',submissionKey:saved.contactSubmissionKey})
      assert.equal(reopened.status,200)
      assert.deepEqual((await reopened.json()).applicant,saved)
      assert.equal(accountCreations,1)
      assert.equal(verificationEmails.at(-1).leadId,'743f9651-330f-4c1a-909d-14c0e1e17092')
    })
    await t.test('the packaged review submits the saved profile, recovers retries and resumes its confirmation', async () => {
      const leadDispatchCount = dispatchCalls.length
      const path='/api/home-seekers/recruitment'
      const signedIn=await send(path,{action:'sign_in',email:resumedApplicant.contact.email,password:'FixturePassword123'})
      const headers={Cookie:signedIn.headers['set-cookie'][0].split(';')[0]}
      const submission={action:'submit_profile',revision:1,submissionKey:'abcdefab-cdef-4abc-8def-abcdefabcdef',privacyAccepted:true,declarationAccepted:true,leadId:'forged',organisationId:'forged',answers:{firstName:'forged'}}
      const count=rpcCalls.length
      assert.equal((await send(path,{...submission,privacyAccepted:false},WEBSITE_HOST,headers)).status,422)
      assert.equal((await send(path,submission)).status,401)
      assert.equal(rpcCalls.length,count)
      const response=await send(path,submission,WEBSITE_HOST,headers)
      assert.equal(response.status,200)
      const result=await response.json()
      assert.equal(result.accepted,true);assert.equal(result.duplicate,false)
      assert.equal(result.applicant.applicationSubmitted,true);assert.equal(result.applicant.stage,'application_submitted')
      assert.deepEqual(result.applicant.submittedApplication.answers,{...validProfile(resumedApplicant.contact.email),packagePreference:'decide_later'})
      const call=rpcCalls.at(-1)
      assert.equal(call.name,'recruitment_submit_verified_profile')
      assert.equal(call.body.p_organisation_id,ORG_ID)
      assert.equal(call.body.p_answers,undefined);assert.equal(call.body.p_lead_id,undefined)
      assert.equal((await (await send(path,submission,WEBSITE_HOST,headers)).json()).duplicate,true)
      assert.deepEqual((await (await send(path,{action:'context'},WEBSITE_HOST,headers)).json()).applicant,result.applicant)
      const returning=await send(path,{action:'sign_in',email:resumedApplicant.contact.email,password:'FixturePassword123'})
      assert.equal((await returning.json()).applicant.applicationSubmitted,true)
      assert.equal(accountCreations,1)
      assert.equal(dispatchCalls.length,leadDispatchCount)
    })

    await t.test('an existing platform account proceeds from contact capture to verified applicant access without changing its account', async () => {
      const accountsBefore = new Map(applicantAccounts), applicantBefore = fixtureApplicant
      const existing = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email: 'applicant@example.test', email_confirmed_at: '2026-10-07T08:00:00Z', app_metadata: { existing_platform_role: 'principal' } }
      const existingBefore = structuredClone(existing), creationsBefore = accountCreations
      applicantAccounts.clear(); applicantAccounts.set(existing.id, existing)
      fixtureApplicant = resumedApplicant
      try {
        const path = '/api/home-seekers/recruitment'
        const signup = await send(path, { action: 'signup', submissionKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', contact: { firstName: 'Fixture', lastName: 'Applicant', email: existing.email, phone: '+27821234567', privacyAccepted: true }, password: 'FixturePassword123' })
        assert.equal(signup.status, 201)
        assert.deepEqual(await signup.json(), { accepted: true, contactAccepted: true, accountCreated: true, verificationRequired: true, duplicate: false, stage: 'lead_received', emailVerification: 'pending' })
        assert.equal(signup.headers['set-cookie'], undefined)
        assert.equal(rpcCalls.at(-1).name, 'recruitment_capture_contact')
        assert.deepEqual(existing, existingBefore)
        assert.equal(accountCreations, creationsBefore)
        assert.equal((await send(path, { action: 'send_verification', email: existing.email })).status, 202)
        const verified = await send(path, { action: 'verify_email', email: existing.email, code: '123456', submissionKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
        assert.equal(verified.status, 200)
        assert.deepEqual(await verified.json(), { applicant: resumedApplicant })
        assert.match(verified.headers['set-cookie'][0], /HttpOnly; SameSite=Lax/)
        assert.deepEqual(existing, existingBefore)
        assert.equal(accountCreations, creationsBefore)
      } finally {
        applicantAccounts.clear(); for (const [id, account] of accountsBefore) applicantAccounts.set(id, account)
        fixtureApplicant = applicantBefore
      }
    })

    await t.test('unknown APIs never fall through to the webpage', async () => {
      for (const path of ['/api/home-seekers/missing', '/api/cron/private-property-event-reconciliation']) {
        const response = await fetch(`${websiteUrl}${path}`)
        assert.equal(response.status, 404)
        assert.deepEqual(await response.json(), { error: 'not_found' })
      }
      for (const path of ['/', '/about', '/contact', '/selling', '/buying?q=Moreleta+Park', '/renting', '/join', '/guarantee', `/properties/${LISTING_ID}`, '/demo/homeseekers', '/demo/homeseekers/buying']) {
        const page = await fetch(`${websiteUrl}${path}`, { redirect: 'manual' })
        assert.equal(page.status, 200, path)
        assert.equal(page.headers.get('location'), null, path)
        assert.match(await page.text(), /<title>Home Seekers<\/title>/)
      }
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
