import {readFileSync} from 'node:fs'
import {actor,agentA,transactionSellerFixture,uuid} from './seller-alignment-database.mjs'
export async function transactionBuyerCaptureFixture(){
const tx = uuid(801), bid = uuid(811), pid = uuid(812)
const db = await transactionSellerFixture({ linked: false })
await actor(db, 'postgres')
await db.exec(`
 alter table transactions add column buyer_id uuid, add column primary_buyer_participant_id uuid,add column onboarding_status text default 'historical',add column current_main_stage text default 'Transfer';
 alter table transaction_participants alter column id set default gen_random_uuid();
 alter table transaction_participants add column transaction_role text,add column buyer_party_id uuid,add column is_primary_buyer boolean default false,add column legal_role text check(legal_role in('none')),add column buyer_party_position int,add column signing_required boolean,add column status text,add column buyer_party_role text,add column buyer_source text,add column buyer_metadata jsonb default '{}';
 create table buyers(id uuid primary key default gen_random_uuid(),organisation_id uuid,name text,email text,phone text);
 create table buyer_profile_data(buyer_id uuid primary key references buyers(id),profile_data jsonb default '{}',profile_version int default 1,updated_by uuid,updated_at timestamptz);
 create table transaction_onboarding(id uuid default gen_random_uuid(),transaction_id uuid,token text,is_active boolean,updated_at timestamptz);
 create table client_portal_links(transaction_id uuid,token text,is_active boolean,updated_at timestamptz);
 create function bridge_onboarding_request_token() returns text language sql as $$select current_setting('request.onboarding_token',true)$$;
 create function bridge_client_portal_request_token() returns text language sql as $$select current_setting('request.portal_token',true)$$;
 -- Existing snapshot contract boundary, no email/lead/side-effect worker.
 create function bridge_save_buyer_onboarding_snapshot_internal(p_form_data jsonb,p_snapshot jsonb,p_funding_sources jsonb,p_submit boolean,p_next_action text) returns jsonb language plpgsql security definer set search_path='' as $$
 declare tx uuid;
 begin
  select transaction_id into tx from public.transaction_onboarding where token=public.bridge_onboarding_request_token() and is_active;
  if tx is null then raise exception 'Token required'; end if;
  update public.onboarding_form_data set form_data=p_form_data,updated_at=now() where transaction_id=tx;
  return jsonb_build_object('onboarding',jsonb_build_object('id','onboarding-test','token','never-return'));
 end $$;
 insert into buyers(id,organisation_id,name,email,phone) values('${bid}','${uuid(21)}','Old Buyer','buyer@example.test','0801');
 update transactions set buyer_id='${bid}' where id='${tx}';
 insert into transaction_onboarding(transaction_id,token,is_active,updated_at) values('${tx}','test-link',true,now());
`)

await db.exec(`
 alter table transactions add column finance_type text,add column finance_managed_by text,add column sales_price numeric,add column purchase_price numeric,add column cash_amount numeric,add column bond_amount numeric,add column deposit_amount numeric,add column reservation_required boolean,add column reservation_amount numeric,add column reservation_status text,add column reservation_paid_date date,add column onboarding_completed_at timestamptz,add column external_onboarding_submitted_at timestamptz,add column next_action text,add column comment text,add column last_meaningful_activity_at timestamptz;
 alter table transaction_onboarding add column status text default 'Not Started',add column purchaser_type text,add column submitted_at timestamptz,add column created_at timestamptz default now();
 create table transaction_funding_sources(transaction_id uuid,source_type text,amount numeric,expected_payment_date date,actual_payment_date date,proof_document text,status text,notes text,updated_at timestamptz);
 create table transaction_events(transaction_id uuid,event_type text,event_data jsonb,created_by uuid,created_by_role text,visibility_scope text,created_at timestamptz,updated_at timestamptz);
 create function bridge_buyer_onboarding_portal_access() returns jsonb language sql as $$select '{}'::jsonb$$;
`)
const snapshotSQL=readFileSync(new URL('../../../supabase/migrations/202607230006_buyer_onboarding_portal_token_handoff.sql',import.meta.url),'utf8')
const snapshotStart=snapshotSQL.indexOf('create or replace function public.bridge_save_buyer_onboarding_snapshot(')
await db.exec(snapshotSQL.slice(snapshotStart,snapshotSQL.indexOf('$$;',snapshotStart)+3).replace('public.bridge_save_buyer_onboarding_snapshot(', 'public.bridge_save_buyer_onboarding_snapshot_internal('))
await db.exec('revoke all on function bridge_save_buyer_onboarding_snapshot_internal(jsonb,jsonb,jsonb,boolean,text) from public,anon,authenticated,service_role')
await db.exec(readFileSync(new URL('../../../supabase/migrations/20261019195213_transaction_buyer_capture_alignment.sql', import.meta.url), 'utf8'))
return {db,tx,bid,pid}
}
