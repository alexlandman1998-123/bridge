import { readFileSync } from 'node:fs'
import { rentalTenantApplicationDatabase,actor,org,property,unit,listing,tenant,lead } from './rentalTenantApplicationDatabase.js'
export {actor,org,property,unit,listing,tenant,lead}
const root=new URL('../../../../supabase/migrations/',import.meta.url)
export async function rentalTenancyUploadDatabase(options){
 const db=await rentalTenantApplicationDatabase(options)
 await db.exec(`create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name,'/'))[1:cardinality(string_to_array(name,'/'))-1] $$;
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant select,insert on storage.objects to authenticated;grant usage on schema storage to authenticated;
 create function public.bridge_agency_lead_scope(p_lead uuid) returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.leads where lead_id=p_lead and organisation_id='${org}' and assigned_agent_id=auth.uid()) $$;
 alter table rental_properties add column address_json jsonb default '{}';`)
 for(const file of ['20260905141012_rental_vacancy_marketing_foundation.sql','20260905141013_rental_internal_marketing_operations.sql','20260830084850_rental_lease_versions.sql','20260830085317_rental_lease_manual_signing.sql','20260913123000_rental_lease_version_seed_for_conversions.sql','20261007211002_rental_application_lease_handoff.sql','20260830085705_rental_move_in_readiness.sql','20260830090204_rental_incoming_inspection.sql','20260830091124_rental_tenancy_activation.sql','20260830091652_rental_tenancy_workspace.sql','20261014210353_rental_tenancy_handoff_uploaded_agreements.sql'])await db.exec(readFileSync(new URL(file,root),'utf8'))
 return db
}
