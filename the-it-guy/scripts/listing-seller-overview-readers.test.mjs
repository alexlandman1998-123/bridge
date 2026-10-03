import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
try {
  await db.exec(`
    create role anon; create role authenticated;
    create table private_listings(id uuid, organisation_id uuid, assigned_agent_id uuid);
    create table profiles(id uuid, full_name text, first_name text, last_name text, email text, phone text);
    create table contacts(contact_id uuid, organisation_id uuid, email text, phone text);
    create table leads(lead_id uuid, organisation_id uuid, contact_id uuid, listing_id text, created_at timestamptz, updated_at timestamptz);
    create table lead_listing_interests(interest_id uuid, lead_id uuid, listing_id uuid, organisation_id uuid, created_at timestamptz);
    create table appointments(organisation_id uuid, listing_id text, status text, appointment_type text, date date, start_time text);
    create table private_listing_activity(id uuid, private_listing_id uuid, performed_by uuid, activity_type text, activity_title text, activity_description text, visibility text, metadata jsonb, created_at timestamptz);
    create function bridge_private_listing_seller_portal_core_payload(text,text,boolean) returns jsonb language sql as $$
      select case when $1='link' and $2='session' and $3=true then '{"listing":{"id":"${id(1)}"}}'::jsonb else '{"authRequired":true}'::jsonb end
    $$;
    insert into private_listings values ('${id(1)}','${id(2)}','${id(3)}'),('${id(9)}','${id(8)}','${id(7)}');
    insert into profiles values ('${id(3)}','Assigned agent',null,null,'agent@example.com','0123');
    insert into contacts values ('${id(4)}','${id(2)}','buyer@example.com','456');
    insert into leads values ('${id(5)}','${id(2)}','${id(4)}','${id(1)}',now(),now()),('${id(6)}','${id(2)}','${id(4)}','${id(1)}',now(),now()),('${id(7)}','${id(8)}',null,'${id(1)}',now(),now());
    insert into appointments values ('${id(2)}','${id(1)}','accepted','viewing','2026-10-04','10:00'),('${id(8)}','${id(1)}','accepted','viewing','2026-10-04','10:00'),('${id(2)}','${id(1)}','accepted','call','2026-10-04','10:00');
    insert into private_listing_activity values
      ('${id(10)}','${id(1)}','${id(3)}','note_shared_with_client','Viewing','Client-visible note','client_visible','{}',now()),
      ('${id(11)}','${id(1)}','${id(3)}','note','Private','Internal-only note','internal','{}',now()),
      ('${id(12)}','${id(9)}','${id(7)}','note_shared_with_client','Other','Other listing note','client_visible','{}',now());
  `)
  for (const filename of ['20261003102500_seller_listing_overview_performance.sql', '20261003112000_seller_listing_overview_context.sql', '20261003112733_seller_listing_marketing_lead_sources.sql']) {
    await db.exec(await fs.readFile(new URL(`../../supabase/migrations/${filename}`, import.meta.url), 'utf8'))
  }
  for (const reader of ['bridge_seller_listing_overview_performance', 'bridge_seller_listing_overview_context', 'bridge_seller_listing_marketing_performance']) {
    await assert.rejects(db.query(`select ${reader}('link','invalid')`), /authentication required/)
    await assert.rejects(db.query(`select ${reader}('','session')`), /authentication required/)
  }
  const metrics = (await db.query("select bridge_seller_listing_overview_performance('link','session') as data")).rows[0].data
  assert.equal(metrics.leads.length, 1, 'deduplicate buyers and exclude another organisation')
  assert.equal(metrics.viewings.length, 1, 'count only this organisation’s listing viewings')
  assert.equal(metrics.viewings[0].status, 'confirmed')
  assert.ok(!JSON.stringify(metrics).includes('buyer@example.com'), 'metrics must not expose buyer contact information')
  const context = (await db.query("select bridge_seller_listing_overview_context('link','session') as data")).rows[0].data
  assert.equal(context.agent.name, 'Assigned agent')
  assert.equal(context.agent.email, 'agent@example.com')
  assert.equal(context.activity.length, 1, 'exclude internal notes and other listings')
  assert.equal(context.activity[0].actor, 'Assigned agent')
  assert.equal(context.activity[0].description, 'Client-visible note')
  assert.equal(context.activity[0].actorRole, 'Agent')
  await db.exec(`
    insert into contacts values ('${id(13)}','${id(2)}','another-buyer@example.com','789');
    insert into leads values ('${id(14)}','${id(2)}','${id(13)}','${id(1)}',now(),now());
    insert into appointments values ('${id(2)}','${id(1)}','requested','viewing','2026-10-05','11:00');
    update private_listing_activity set activity_description='Updated client-visible note' where id='${id(10)}';
  `)
  const updatedMetrics = (await db.query("select bridge_seller_listing_overview_performance('link','session') as data")).rows[0].data
  const updatedContext = (await db.query("select bridge_seller_listing_overview_context('link','session') as data")).rows[0].data
  assert.equal(updatedMetrics.leads.length, 2, 'saved lead changes must be visible on the next read')
  assert.equal(updatedMetrics.viewings.length, 2, 'saved viewing changes must be visible on the next read')
  assert.equal(updatedContext.activity[0].description, 'Updated client-visible note', 'edited agent notes must refresh from the saved record')
  await db.exec(`
    alter table leads add column lead_source text;
    update leads set lead_source='Property 24' where lead_id in ('${id(5)}','${id(6)}','${id(7)}');
    insert into leads values ('${id(15)}','${id(2)}',null,'${id(1)}',now(),now(),'Private Property'),('${id(16)}','${id(2)}',null,null,now(),now(),'Website');
    insert into lead_listing_interests values ('${id(17)}','${id(16)}','${id(1)}','${id(2)}',now()),('${id(18)}','${id(16)}','${id(1)}','${id(2)}',now());
  `)
  const marketing = (await db.query("select bridge_seller_listing_marketing_performance('link','session') as data")).rows[0].data
  assert.deepEqual(marketing.channelLeads, { property24: 1, privateProperty: 1, website: 1, other: 1 }, 'attribute only this listing’s leads, deduplicate buyers and repeated interest links')
  assert.equal(marketing.leads.length, 4, 'retain the canonical overview metrics')
  assert.ok(!JSON.stringify(marketing).includes('buyer@example.com'), 'source attribution must not expose buyer details')
  await db.exec(`update leads set lead_source='Property24' where lead_id='${id(14)}';`)
  const refreshedMarketing = (await db.query("select bridge_seller_listing_marketing_performance('link','session') as data")).rows[0].data
  assert.equal(refreshedMarketing.channelLeads.property24, 2, 'saved attribution changes must refresh')
  assert.equal(refreshedMarketing.channelLeads.other, 0, 'return a verified zero after reclassification')
  console.log('Seller overview readers: session denial, listing isolation, buyer privacy, deduplication and authored activity passed.')
} finally {
  await db.close()
}
