import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

export async function createSignedBuyerOtpCaptureFixture() {
const migration = await readFile(new URL('../../../supabase/migrations/20261031095725_signed_buyer_otp_transaction_capture.sql', import.meta.url), 'utf8')
const reviewMigration = await readFile(new URL('../../../supabase/migrations/20261031103014_stage_signed_buyer_otp_before_review.sql', import.meta.url), 'utf8')
const notificationMigration = await readFile(new URL('../../../supabase/migrations/20261031104446_suppress_controlled_transaction_test_notifications.sql', import.meta.url), 'utf8')
const scopeMigration = await readFile(new URL('../../../supabase/migrations/20261031104119_align_signed_otp_capture_scope.sql', import.meta.url), 'utf8')
const schemaMigration = await readFile(new URL('../../../supabase/migrations/20261031110822_repair_signed_otp_transaction_schema.sql', import.meta.url), 'utf8')
const handoffMigration = await readFile(new URL('../../../supabase/migrations/20261031111520_preserve_current_buyer_document_handoff.sql', import.meta.url), 'utf8')
const db = new PGlite()
const actor = randomUUID(), admin = randomUUID(), colleague = randomUUID(), org = randomUUID(), lead = randomUUID(), listing = randomUUID()
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage; create schema document_security;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
`)
await db.exec(await readFile(new URL('./signed-buyer-otp-production-transaction-schema.sql', import.meta.url), 'utf8'))
await db.exec(`
create unique index on transactions(organisation_id,creation_idempotency_key) where creation_idempotency_key is not null;
create table leads(lead_id uuid primary key,organisation_id uuid,lead_domain text,lead_category text,assigned_agent_id uuid,raw_enquiry_payload jsonb,status text,stage text,current_stage text,converted_transaction_id uuid,converted_at timestamptz,updated_at timestamptz,first_name text,last_name text,email text,phone text);
create table private_listings(id uuid primary key,organisation_id uuid,seller_lead_id text,seller_contact_id uuid);
create table private_listing_role_players(private_listing_id uuid,role_type text,allocation_status text,transaction_id uuid,instructed_at timestamptz,instruction_source text,updated_at timestamptz);
create table contacts(contact_id uuid primary key,organisation_id uuid);
create table private_listing_seller_onboarding(id uuid,private_listing_id uuid,form_data jsonb,updated_at timestamptz);
create table offers(id uuid,organisation_id uuid,status text,buyer_lead_id uuid,buyer_contact_id uuid,seller_lead_id uuid,seller_contact_id uuid,listing_id uuid,offer_amount numeric,deposit_amount numeric,cash_component numeric,bond_component numeric,transaction_id uuid,converted_to_transaction_at timestamptz);
create table buyers(id uuid primary key default gen_random_uuid(),organisation_id uuid,name text,phone text,email text);
create table organisation_users(organisation_id uuid,user_id uuid,workspace_role text,organization_role text,organisation_role text,role text,app_role text,membership_status text,status text,created_at timestamptz);
create table storage.objects(bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
create table fixture_seed_calls(transaction_id uuid,kind text,payload jsonb,primary key(transaction_id,kind));
create function bridge_is_active_member(uuid) returns boolean language sql as $$select $1='${org}'::uuid and auth.uid() in ('${actor}','${admin}','${colleague}')$$;
create function bridge_can_access_assignment(uuid,uuid,uuid) returns boolean language sql as $$select $1='${org}'::uuid and (auth.uid()=$2 or auth.uid()='${admin}'::uuid)$$;
create function bridge_can_create_transaction_override(uuid) returns boolean language sql as $$select auth.uid()='${admin}'::uuid$$;
create function bridge_offer_wet_ink_execution_ready(uuid,uuid,uuid) returns boolean language sql as $$select false$$;
create function bridge_seed_mvp_transaction_participants(uuid,jsonb) returns void language sql as $$insert into fixture_seed_calls values($1,'participants',$2) on conflict do nothing$$;
create function bridge_seed_mvp_transaction_documents(uuid,jsonb) returns void language sql as $$insert into fixture_seed_calls values($1,'documents',$2) on conflict do nothing$$;
create function bridge_seed_mvp_transaction_workflow_lanes(uuid,uuid,jsonb) returns void language sql as $$insert into fixture_seed_calls values($1,'workflow',$3) on conflict do nothing$$;
grant usage on schema auth to authenticated;
`)
await db.exec(`
create table profiles(id uuid primary key,role text);
create table notification_automation_definitions(automation_key text,implementation_status text,default_enabled boolean);
create table notification_events(id uuid primary key default gen_random_uuid(),automation_key text,organisation_id uuid,branch_id uuid,assigned_user_id uuid,transaction_id uuid,recipient_user_id uuid,event_key text,category text,trigger_type text,channel text,status text,recipient_email text,recipient_address text,recipient_role text,subject text,message_preview text,provider text,source text,dedupe_key text,idempotency_key text,payload_json jsonb,metadata_json jsonb,queued_at timestamptz,next_dispatch_attempt_at timestamptz,unique(organisation_id,dedupe_key));
create function bridge_transaction_owner_email_phase4(transactions) returns table(email text,user_id uuid,name text) language sql as $$select 'owner@example.test'::text,'${actor}'::uuid,'Fixture owner'::text$$;
create function bridge_transaction_reference_phase4(transactions) returns text language sql as $$select 'QA reference'::text$$;
create function bridge_transaction_property_label_phase4(transactions) returns text language sql as $$select 'Fixture property'::text$$;
create function bridge_transaction_stage_label_phase4(transactions) returns text language sql as $$select ($1).stage$$;

create table attorney_firm_members(user_id uuid,status text);
create table documents(id uuid primary key default gen_random_uuid(),transaction_id uuid,name text,file_path text,file_bucket text,category text,document_type text,source text,status text,metadata jsonb,uploaded_by_user_id uuid,canonical_requirement_instance_id uuid);
create table document_definitions(key text primary key,review_required boolean);
create table document_requirement_instances(id uuid primary key default gen_random_uuid(),transaction_id uuid,document_definition_key text,status text default 'pending',uploadable_by_roles text[],applicability_override text,satisfied_by_document_id uuid,rejection_reason text,source_system text,updated_at timestamptz);
create table transaction_required_documents(transaction_id uuid,document_key text,is_uploaded boolean,uploaded_document_id uuid,canonical_requirement_instance_id uuid,status text,uploaded_at timestamptz,updated_at timestamptz);
create table document_requirement_events(requirement_instance_id uuid,event_type text,actor_role text,actor_user_id uuid,message text,metadata_json jsonb);
create function document_security.can_upload(uuid) returns boolean language sql stable security definer as $$select exists(select 1 from transactions where id=$1 and (assigned_agent_id=auth.uid() or auth.uid()='${admin}'::uuid))$$;
create function document_security.can_read(documents) returns boolean language sql stable security definer as $$select document_security.can_upload(($1).transaction_id)$$;
`)
await db.query("insert into profiles values ($1,'agent'),($2,'admin'),($3,'agent')",[actor,admin,colleague])
await db.query("insert into document_definitions values ('signed_otp',true),('buyer_id_document',true)")
await db.exec(migration)
await db.exec(reviewMigration)
await db.exec(scopeMigration)
await db.exec(notificationMigration)
await db.exec(schemaMigration)
await db.exec(handoffMigration)
await db.exec(await readFile(new URL('./signed-buyer-otp-legacy-instruction-trigger.sql',import.meta.url),'utf8'))
const objectPath = `buyer-otp-documents/${org}/${lead}/uploaded_otp/retained.pdf`
const evidence = { listingId: listing, source:'agent_otp_upload',storageBucket:'documents',storagePath:objectPath,fileSize:512,metadata:{signedByAllPartiesConfirmed:true,arch9TermsIncludedConfirmed:true,transactionFeeConsentIncludedConfirmed:true,offerAmount:1000000,financeType:'cash'} }
await db.query('insert into leads(lead_id,organisation_id,lead_domain,lead_category,assigned_agent_id,raw_enquiry_payload,status,stage) values($1,$2,\'agency\',\'buyer\',$3,$4,\'Viewing\',\'Viewing\')',[lead,org,actor,{buyerOtpDocument:evidence}])
await db.query('insert into private_listings values($1,$2,null,null)',[listing,org])
await db.query("insert into private_listing_role_players(private_listing_id,role_type,allocation_status) values($1,'transfer_attorney','awaiting_buyer')",[listing])
await db.query("insert into storage.objects values('documents',$1,'{\"size\":512}')",[objectPath])
const payload = { organisation_id:org,originating_lead_id:lead,listing_id:listing,assigned_agent_id:actor,owner_user_id:actor,transaction_type:'private_sale',purchaser_type:'individual',creation_mode:'signed_otp_capture',signed_otp_storage_path:objectPath,creation_idempotency_key:`signed-otp:${lead}:${listing}`,purchase_price:1000000,sales_price:1000000,finance_type:'cash',stage:'OTP Signed',current_main_stage:'OTP',onboarding_status:'signed_otp_received',routing_profile_json:{transactionType:'private_sale',financeType:'cash',propertyTenure:'freehold',buyerEntityType:'individual',sellerEntityType:'individual'} }
async function capture(value=payload,who=actor) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who])
  await db.exec('set role authenticated')
  try { return (await db.query('select bridge_create_mvp_transaction($1) result',[value])).rows[0].result }
  finally { await db.exec('reset role') }
}
const count = async table => (await db.query(`select count(*)::int count from ${table}`)).rows[0].count

return { db, actor, admin, colleague, org, lead, listing, objectPath, evidence, payload, capture, count };
}
