import {readFileSync} from 'node:fs'
export async function installMarketingMeasurementFixture(f) {
 const {db}=f
 await db.exec('reset role')
 for(const name of ['email_campaign_link_performance','email_campaign_performance','email_deliverability_health','email_campaign_daily_performance','email_campaign_category_performance']) {
  const start=f.foundation.indexOf('create or replace view public.'+name)
  await db.exec(f.foundation.slice(start).split(';')[0]+';')
 }
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261108220000_marketing_measurement_integrity.sql',import.meta.url),'utf8'))
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261108220500_email_tracking_readiness.sql',import.meta.url),'utf8'))
 await db.exec(`
 create table whatsapp_campaigns(id uuid primary key,organisation_id uuid not null);
 create table whatsapp_campaign_recipients(id uuid primary key,organisation_id uuid,campaign_id uuid);
 create table whatsapp_campaign_reply_routes(id uuid primary key default gen_random_uuid(),organisation_id uuid,campaign_id uuid,recipient_id uuid);
 create table website_sites(id uuid primary key,organisation_id uuid,status text);
 create table website_domains(website_site_id uuid,hostname text,status text,is_primary boolean,created_at timestamptz default now());
 create table leads(lead_id uuid primary key,organisation_id uuid);
 create table transactions(id uuid primary key,organisation_id uuid,originating_lead_id uuid,originating_buyer_lead_id uuid,originating_seller_lead_id uuid,registered_at timestamptz,registration_reversed_at timestamptz);
 create table appointments(appointment_id uuid primary key,organisation_id uuid,lead_id uuid);
 create table website_lead_submissions(id uuid primary key,website_site_id uuid,organisation_id uuid,lead_id uuid,status text,attribution_json jsonb,created_at timestamptz default now(),routed_at timestamptz);
 create table website_analytics_daily(website_site_id uuid,event_date date,event_type text,page_path text,dimension_key text,listing_id uuid,event_count integer,primary key(website_site_id,event_date,event_type,page_path,dimension_key));
 create view website_test_counts as select event_type,sum(event_count)::integer n from website_analytics_daily group by event_type;
 create table website_listing_publications(website_site_id uuid,listing_id uuid,status text);
 create table website_partner_listing_publications(website_site_id uuid,listing_id uuid,grant_id uuid,status text);
 create table website_partner_listing_grants(id uuid,website_site_id uuid,source_organisation_id uuid,enabled boolean);
 create table private_listings(id uuid,organisation_id uuid);

 grant all on all tables in schema public to service_role;
 alter table whatsapp_campaigns enable row level security;
 create policy member on whatsapp_campaigns for select to authenticated using(bridge_has_organisation_membership(organisation_id));
 grant select on whatsapp_campaigns,whatsapp_campaign_reply_routes to authenticated;
 `)
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261108221000_marketing_attribution_and_conversions.sql',import.meta.url),'utf8'))
 await db.exec('grant select on all tables in schema public to service_role')

}
