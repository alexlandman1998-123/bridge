// Serves real onboarding components/APIs over loopback using isolated PostgreSQL
// and ephemeral private file bytes. No hosted database or email is contacted.
import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import {
  rentalOnboardingDatabase,
  actor,
  org,
  property,
  unit,
  vacancy,
  app,
} from '../server/tests/fixtures/rentalOnboardingDatabase.js'
import { rentalOnboardingClient } from '../server/tests/fixtures/rentalOnboardingClient.js'
import {
  handleRentalLandlordOnboarding,
  handlePublicRentalLandlordOnboarding,
} from '../server/services/rentalLandlordOnboardingApi.js'
import { handlePublicRentalApplication } from '../server/services/publicRentalApplicationApi.js'
import { handleRentalAgentDocumentUpload } from '../server/services/rentalApplicationAgentDocumentApi.js'
const host = '127.0.0.1',
  port = Number(process.env.RENTAL_FIXTURE_PORT || 4186),
  origin = `http://${host}:${port}`
const lead = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  second = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const db = await rentalOnboardingDatabase()
const files = new Map(),
  links = new Map(),
  requests = []
await db.exec(`alter table rental_application_documents add column storage_bucket text default 'rental-application-documents',add column mime_type text,add column file_size_bytes integer;
 alter table organisations add column name text,add column display_name text,add column logo_url text;
 create table organisation_settings(organisation_id uuid primary key,settings_json jsonb);
 create table rental_application_access_tokens(id uuid default gen_random_uuid(),application_id uuid,token_hash text unique,expires_at timestamptz,revoked_at timestamptz,last_accessed_at timestamptz);
 create unique index fixture_consent_retry on rental_application_consents(application_id,consent_type,wording_version);
 alter table leads enable row level security; create policy fixture_leads_read on leads for select to authenticated using(organisation_id='${org}' and auth.uid()='${actor}');
 grant select on rental_onboarding_requirement_summaries to authenticated;`)
await db.exec(`create function bridge_current_workspace_role(workspace_id uuid) returns text language sql as $$ select 'owner'::text $$;`)
await db.exec(await readFile(new URL('../../supabase/migrations/20261007194611_rental_application_cost_confirmation.sql', import.meta.url), 'utf8'))
await db.query('insert into rental_application_fee_settings(organisation_id,amount,payment_instructions) values($1,350,$2)', [org, 'Local preview only. Your rentals team would provide payment instructions here.'])
await db.query('update organisations set name=$1 where id=$2', ['Arch9 Rentals', org])
await db.query('insert into organisation_settings(organisation_id,settings_json) values($1,$2::jsonb)', [org, JSON.stringify({ agencyOnboarding: { branding: { organisationName: 'Arch9 Rentals', logoDarkUrl: `${origin}/favicon-light.svg`, primaryColour: '#001a3d', secondaryColour: '#001b44', accentColour: '#f7cf22' } } })])
await db.query(
  'insert into rental_properties(id,organisation_id) values($1,$2)',
  [second, org],
)
const profile = {
  type: 'individual',
  name: 'Fixture Owner',
  email: 'owner@example.test',
  idNumber: 'LOCAL-OWNER',
  notes: 'Agent-only note',
}
const portfolio = [
  {
    id: 'first',
    title: 'First home',
    address: 'One Road',
    canonicalPropertyId: property,
  },
  {
    id: 'second',
    title: 'Second home',
    address: 'Two Road',
    canonicalPropertyId: second,
  },
]
await db.query(
  'insert into leads(lead_id,organisation_id,raw_enquiry_payload) values($1,$2,$3::jsonb)',
  [
    lead,
    org,
    JSON.stringify({
      arch9RentalLead: true,
      role: 'landlord',
      landlordProfile: profile,
      landlordPortfolio: portfolio,
    }),
  ],
)
await db.exec(readFileSync(new URL('../../supabase/migrations/20261007204950_rental_application_document_packs.sql', import.meta.url), 'utf8'))
await db.exec(readFileSync(new URL('../../supabase/migrations/20261007212433_rental_empty_document_pack_readiness.sql', import.meta.url), 'utf8'))
const data = {
  schemaVersion: 'arch9_rental_application_fields_v2',
  entity: { type: 'individual' },
  identity: {
    firstName: 'Fixture',
    lastName: 'Applicant',
    email: 'tenant@example.test',
    identityNumber: 'LOCAL-TENANT',
  },
  employment: { employmentType: 'employed', employer: 'Fixture Ltd' },
  income: { monthlyIncome: 25000, otherIncome: 0 },
  rentalHistory: { currentAddress: 'Previous Road', reasonForMoving: 'Work' },
  household: {
    occupantCount: 1,
    intendedOccupationDate: '2026-11-01',
    leasePeriodMonths: 12,
  },
  property: { title: 'First home', monthlyRent: 11000 },
}
await db.query(
  'insert into rental_applications(id,organisation_id,vacancy_id,unit_id,application_data) values($1,$2,$3,$4,$5::jsonb)',
  [app, org, vacancy, unit, JSON.stringify(data)],
)
const hash = (token) => createHash('sha256').update(token).digest('hex')
await db.query(
  "insert into rental_landlord_onboarding_access(lead_id,organisation_id,token_hash,expires_at) values($1,$2,$3,'2099-01-01')",
  [lead, org, hash('fixture-landlord')],
)
await db.query(
  "insert into rental_application_access_tokens(application_id,token_hash,expires_at) values($1,$2,'2099-01-01')",
  [app, hash('fixture-tenant')],
)
const storage = {
  from: (bucket) => ({
    createSignedUploadUrl: async (path) => {
      const token = randomBytes(24).toString('hex')
      links.set(token, {
        bucket,
        path,
        method: 'PUT',
        expiry: Date.now() + 600000,
      })
      return { data: { signedUrl: `${origin}/__fixture/files/${token}` } }
    },
    createSignedUrl: async (path, seconds) => {
      const token = randomBytes(24).toString('hex')
      links.set(token, {
        bucket,
        path,
        method: 'GET',
        expiry: Date.now() + seconds * 1000,
      })
      return { data: { signedUrl: `${origin}/__fixture/files/${token}` } }
    },
    info: async (path) => {
      const file = files.get(`${bucket}/${path}`)
      return file
        ? { data: { size: file.bytes.length, contentType: file.type } }
        : { error: new Error('File unavailable') }
    },
    remove: async (paths) => {
      paths.forEach((path) => files.delete(`${bucket}/${path}`))
      return { data: [] }
    },
  }),
}
const env = {
  SUPABASE_URL: origin,
  SUPABASE_ANON_KEY: 'fixture-public',
  SUPABASE_SERVICE_ROLE_KEY: randomBytes(32).toString('hex'),
}
const clientFactory = (_url, key) =>
  rentalOnboardingClient(db, storage, actor, key === 'fixture-public')
process.env.VITE_SUPABASE_URL = `https://${host}:${port}`
process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_fixture_local'
const { createServer: createViteServer } = await import('vite')
const vite = await createViteServer({
  cacheDir: '/tmp/arch9-rental-onboarding-vite-cache',
  optimizeDeps: { entries: ['test-fixtures/rental-onboarding.html'] },
  server: { middlewareMode: true },
  appType: 'custom',
})
const send = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}
async function state() {
  return {
    lead,
    app,
    property,
    second,
    files: files.size,
    landlord: (
      await db.query(
        'select rental_landlord_onboarding_snapshot($1,$2::jsonb) result',
        [lead, JSON.stringify({ organisation_id: org })],
      )
    ).rows[0].result,
    application: (
      await db.query('select * from rental_applications where id=$1', [app])
    ).rows[0],
    tenantRequirements: (
      await db.query(
        'select * from rental_onboarding_requirement_summaries where application_id=$1',
        [app],
      )
    ).rows,
    events: (
      await db.query(
        'select version,command from rental_landlord_onboarding_events where lead_id=$1 order by version',
        [lead],
      )
    ).rows,
    requests,
  }
}
const server = createServer(async (req, res) => {
  const path = new URL(req.url, origin).pathname
  try {
    if (path === '/favicon.ico') {
      res.writeHead(204)
      res.end()
      return
    }
    if (path.startsWith('/__fixture/files/')) {
      const access = links.get(path.split('/').pop())
      if (!access || access.method !== req.method || access.expiry < Date.now())
        return send(res, 403, { error: 'Private file access denied' })
      const key = `${access.bucket}/${access.path}`
      if (req.method === 'PUT') {
        if (files.has(key)) return send(res, 409, { error: 'Existing file' })
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const bytes = Buffer.concat(chunks)
        if (bytes.length > 8388608)
          return send(res, 413, { error: 'Too large' })
        files.set(key, { bytes, type: req.headers['content-type'] })
        return send(res, 200, { uploaded: true })
      }
      const file = files.get(key)
      if (!file) return send(res, 404, { error: 'Missing file' })
      res.writeHead(200, {
        'Content-Type': file.type,
        'Cache-Control': 'no-store',
      })
      res.end(file.bytes)
      return
    }
    if (path.startsWith('/api/') || path === '/__fixture/control') {
      const chunks = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 1048576)
          return send(res, 413, { error: 'Fixture body too large' })
        chunks.push(chunk)
      }
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : Object.fromEntries(new URL(req.url, origin).searchParams)
      const input = {
        method: req.method,
        headers: req.headers,
        body,
        env,
        clientFactory,
      }
      const handler = {
        '/api/public/rental-landlord-onboarding':
          handlePublicRentalLandlordOnboarding,
        '/api/rentals/landlord-onboarding': handleRentalLandlordOnboarding,
        '/api/public/rental-application': handlePublicRentalApplication,
        '/api/rentals/application-documents': handleRentalAgentDocumentUpload,
      }[path]
      if (handler) {
        const result = await handler(input)
        requests.push({
          path,
          method: req.method,
          action: body.action || null,
          status: result.status,
        })
        return send(res, result.status, result.body)
      }
      if (path === '/__fixture/control') {
        if (req.headers.authorization !== 'Bearer fixture-agent')
          return send(res, 401, { error: 'Fixture agent required' })
        if (req.method === 'GET') return send(res, 200, await state())
        if (body.action === 'mandate') {
          await db.query(
            "insert into rental_property_mandates(organisation_id,property_id,mandate_status,metadata_json) values($1,$2,'active',$3::jsonb)",
            [
              org,
              body.propertyId || property,
              JSON.stringify({ leadId: lead }),
            ],
          )
          return send(res, 200, { created: true })
        }
        if (body.action === 'review') {
          const result = await clientFactory('', 'fixture-public').rpc(
            'rental_record_application_review',
            {
              p_application_id: app,
              p_expected_version: body.version,
              p_command: body.command,
              p_payload: body.patch || {},
            },
          )
          return send(
            res,
            result.error ? 409 : 200,
            result.error ? { error: result.error.message } : result.data,
          )
        }
        if (body.action === 'convert') {
          const result = await clientFactory('', 'fixture-public').rpc(
            'rental_convert_application_to_tenancy',
            { p_application_id: app, p_expected_version: body.version },
          )
          return send(
            res,
            result.error ? 409 : 200,
            result.error ? { error: result.error.message } : result.data,
          )
        }
        return send(res, 400, { error: 'Unknown fixture action' })
      }
      return send(res, 404, { error: 'No fixture route' })
    }
    if (
      path.startsWith('/__fixture/agent') ||
      path.startsWith('/rental-application/') ||
      path.startsWith('/rental-landlord-onboarding/')
    ) {
      const html = await readFile(
        new URL('../test-fixtures/rental-onboarding.html', import.meta.url),
        'utf8',
      )
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(await vite.transformIndexHtml(req.url, html))
      return
    }
    vite.middlewares(req, res, () =>
      send(res, 404, { error: 'Fixture route not found' }),
    )
  } catch (error) {
    send(res, 409, { error: error.message })
  }
})
server.listen(port, host, () =>
  console.log(`Rental onboarding fixture ready: ${origin}`),
)
async function close() {
  await vite.close()
  server.close()
  await db.close()
  process.exit(0)
}
process.on('SIGTERM', close)
process.on('SIGINT', close)
