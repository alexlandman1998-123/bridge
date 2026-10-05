import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

export const HOME_SEEKERS_LEAD_FIXTURE = {
  org: '2958d402-368e-43c9-b728-0098e10505f1', site: 'c2fcb2e4-23c1-4302-b490-7332f5075669',
  revision: '484c8537-9996-40e8-abc9-651d9058a10c',
  agent: '11111111-1111-4111-8111-111111111111', principal: '22222222-2222-4222-8222-222222222222',
  sale: 'ffec99be-27f8-4bba-ae3f-76b37b4bd9c1', rental: '4615603e-7299-43df-9d94-b4f7b67460bc',
  host: 'home-seekers-website-alpha.vercel.app',
}
const migration = (name) => readFile(new URL(`../../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')

export async function createHomeSeekersLeadDatabase() {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table website_sites(id uuid primary key, organisation_id uuid, status text, published_revision_id uuid);
      create table website_domains(website_site_id uuid, hostname text, status text, is_primary boolean, created_at timestamptz default now());
      create table website_site_revisions(id uuid primary key, website_site_id uuid, status text);
      create table website_pages(id uuid primary key default gen_random_uuid(), website_site_id uuid, revision_id uuid, page_kind text, slug text);
      create table private_listings(id uuid primary key, organisation_id uuid, assigned_agent_id uuid, listing_category text);
      create table listing_publication_data(listing_id uuid primary key, status text, title text, address text, asking_price numeric, listing_type text);
      create table website_listing_publications(website_site_id uuid, listing_id uuid, status text);
      create table organisation_users(organisation_id uuid, user_id uuid, email text, first_name text, last_name text, branch_id uuid, status text, role text, is_primary_owner boolean, updated_at timestamptz default now());
      create table website_lead_submissions(id uuid primary key default gen_random_uuid(), website_site_id uuid, organisation_id uuid, listing_id uuid, page_id uuid, submission_type text, idempotency_key text, payload_json jsonb, attribution_json jsonb, request_fingerprint text, consent_json jsonb, routing_json jsonb, status text, failure_reason text, notification_status text, contact_id uuid, lead_id uuid, notification_event_id uuid, fallback_notification_event_id uuid, created_at timestamptz default now(), updated_at timestamptz default now(), unique(website_site_id,idempotency_key));
      create table contacts(contact_id uuid primary key default gen_random_uuid(), organisation_id uuid, assigned_agent_id uuid, first_name text, last_name text, email text, phone text, contact_type text, notes text, updated_at timestamptz default now(), created_at timestamptz default now());
      create table leads(lead_id uuid primary key default gen_random_uuid(), organisation_id uuid, branch_id uuid, assigned_agent_id uuid, assigned_user_id uuid, assigned_agent_email text, contact_id uuid, lead_domain text, lead_category text, lead_direction text, lead_source text, source_channel text, campaign_code text, stage text, status text, priority text, ownership_status text, assigned_at timestamptz, sla_due_at timestamptz, listing_id uuid, enquired_listing_id uuid, enquired_property_title text, enquired_property_address text, enquired_property_price numeric, source_reference_id text, raw_enquiry_payload jsonb, notes text, seller_property_address text);
      create table lead_activities(organisation_id uuid, lead_id uuid, agent_id uuid, activity_type text, activity_note text, activity_date timestamptz, outcome text);
      create table notification_events(id uuid primary key default gen_random_uuid(), automation_key text, organisation_id uuid, branch_id uuid, assigned_user_id uuid, lead_id uuid, listing_id uuid, event_key text, category text, trigger_type text, channel text, status text, recipient_email text, recipient_role text, subject text, message_preview text, source text, dedupe_key text, payload_json jsonb, metadata_json jsonb, prepared_at timestamptz, queued_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), dispatch_attempt_count integer default 0, max_dispatch_attempts integer default 5, next_dispatch_attempt_at timestamptz, last_dispatch_attempt_at timestamptz, last_dispatch_error text);
      create table transaction_notifications(id uuid primary key default gen_random_uuid(), user_id uuid, title text, message text, dedupe_key text unique, event_data jsonb);
      create function bridge_insert_invite_accepted_transaction_notification_phase2(uuid,uuid,text,text,text,text,jsonb) returns uuid language sql as $$ insert into public.transaction_notifications(user_id,title,message,dedupe_key,event_data) values ($2,$4,$5,$6,$7) returning id $$;
      create schema vault; create table vault.decrypted_secrets(name text, decrypted_secret text);
      create schema net; create table net.requests(id bigint generated always as identity, url text, headers jsonb, body jsonb);
      create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) returns bigint language sql as $$ insert into net.requests(url,headers,body) values ($1,$2,$3) returning id $$;
      create schema cron; create table cron.job(jobid bigint generated always as identity, jobname text unique, schedule text, command text, active boolean default true);
      create function cron.schedule(text,text,text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values ($1,$2,$3) returning jobid $$;
      create function cron.unschedule(bigint) returns boolean language sql as $$ with removed as (delete from cron.job where jobid=$1 returning jobid) select exists(select 1 from removed) $$;
    `)
    const original = await migration('20260905182234_public_websites_phase5_lead_ingestion')
    const start = original.indexOf('create or replace function public.website_capture_lead_submission(')
    const end = original.indexOf('$$;', start) + 3
    await db.exec(original.slice(start, end))
    await db.exec(`alter table website_lead_submissions add column routed_at timestamptz;
      alter table notification_events add column idempotency_key text, add column error_message text,
        add column provider text, add column provider_message_id text, add column sent_at timestamptz,
        add column failed_at timestamptz;`)
    const durable = await migration('20260906093524_public_websites_durable_lead_dispatch')
    for (const name of ['website_prepare_lead_notification_dispatch_phase3', 'website_claim_lead_notifications', 'website_complete_lead_notification']) {
      const functionStart = durable.indexOf(`create or replace function public.${name}(`)
      await db.exec(durable.slice(functionStart, durable.indexOf('$$;', functionStart) + 3))
    }
    await db.exec('create trigger prepare_website_notification before insert on notification_events for each row execute function website_prepare_lead_notification_dispatch_phase3();')
    const continuity = await migration('20260912103000_arch9_reference_crm_continuity')
    const attributionStart = continuity.indexOf('do $$', continuity.indexOf("-- Keep the public API's explicit lead-source metadata"))
    await db.exec(continuity.slice(attributionStart, continuity.indexOf('$$;', attributionStart) + 3))
    const intent = await migration('20260914145420_website_lead_intent_routing_and_bell_notification')
    await db.exec(intent.slice(intent.indexOf('do $intent_routing$'), intent.indexOf('$intent_routing$;', intent.indexOf('do $intent_routing$')) + '$intent_routing$;'.length))
    await db.exec(await migration('20260916173000_website_enquiries_notify_principal'))
    await db.exec(await migration('20260926172852_rental_lead_intake_classification'))
    await db.exec(await migration('20260929115103_home_seekers_seller_email_dispatch'))
    await db.exec(await migration('20261004104401_home_seekers_lead_notification_queue'))
    await db.exec(`revoke all on function website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb) from public,anon,authenticated; grant execute on function website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb) to service_role;`)
    const f = HOME_SEEKERS_LEAD_FIXTURE
    await db.query('insert into website_sites values($1,$2,\'published\',$3)', [f.site, f.org, f.revision])
    await db.query('insert into website_domains(website_site_id,hostname,status,is_primary) values($1,$2,\'active\',true)', [f.site, f.host])
    await db.query('insert into website_site_revisions values($1,$2,\'published\')', [f.revision, f.site])
    for (const kind of ['home', 'contact', 'about', 'valuation']) await db.query('insert into website_pages(website_site_id,revision_id,page_kind,slug) values($1,$2,$3,$3)', [f.site, f.revision, kind])
    for (const [id, type] of [[f.sale, 'Sale'], [f.rental, 'Rental']]) {
      await db.query('insert into private_listings values($1,$2,$3,$4)', [id, f.org, f.agent, type.toLowerCase()])
      await db.query('insert into listing_publication_data values($1,\'Published\',$2,\'Approved address\',10000,$3)', [id, `Approved ${type} property`, type])
      await db.query('insert into website_listing_publications values($1,$2,\'published\')', [f.site, id])
    }
    for (const [id, role] of [[f.agent, 'agent'], [f.principal, 'principal']]) await db.query('insert into organisation_users(organisation_id,user_id,email,status,role,is_primary_owner) values($1,$2,$3,\'active\',$4,true)', [f.org, id, `${role}@example.test`, role])
    return db
  } catch (error) { await db.close(); throw error }
}

export function homeSeekersSqlConnection(db) {
  const f = HOME_SEEKERS_LEAD_FIXTURE
  return async () => ({ site: { id: f.site, published_revision_id: f.revision }, hostname: f.host, client: {
    from(table) {
      if (table !== 'website_pages') throw new Error('Unexpected fixture table')
      const values = []
      return { select() { return this }, eq(field, value) { values.push([field, value]); return this }, async maybeSingle() {
        const conditions = values.map(([field], i) => { if (!['website_site_id', 'revision_id', 'page_kind'].includes(field)) throw new Error('Invalid fixture field'); return `${field}=$${i + 1}` }).join(' and ')
        return { data: (await db.query(`select id from website_pages where ${conditions}`, values.map(([, value]) => value))).rows[0], error: null }
      } }
    }, async rpc(name, parameters) {
      if (name !== 'website_capture_lead_submission') throw new Error('Unexpected fixture RPC')
      try { return { data: (await db.query(`select public.website_capture_lead_submission(${Object.keys(parameters).map((_, i) => `$${i + 1}`).join(',')}) as result`, Object.values(parameters))).rows[0].result, error: null } }
      catch (error) { return { data: null, error } }
    },
  } })
}
