-- All work accepted by these endpoints commits on the server, including its
-- receipt. Browser closure cannot strand the second half of an accepted save.
alter table public.developments add column if not exists revision bigint not null default 0;
alter table public.development_profiles add column if not exists revision bigint not null default 0;
create or replace function public.bridge_development_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin new.revision := old.revision + 1; return new; end; $$;
revoke all on function public.bridge_development_revision() from public, anon;
drop trigger if exists development_revision on public.developments;
create trigger development_revision before update on public.developments for each row execute function public.bridge_development_revision();
drop trigger if exists development_profile_revision on public.development_profiles;
create trigger development_profile_revision before update on public.development_profiles for each row execute function public.bridge_development_revision();

create schema if not exists arch9_private;
revoke all on schema arch9_private from public, anon;
grant usage on schema arch9_private to authenticated;
create table arch9_private.development_write_receipts (
 request_id uuid primary key, development_id uuid not null references public.developments(id) on delete cascade,
 actor_id uuid not null, payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
alter table arch9_private.development_write_receipts enable row level security;
create index development_write_receipts_development_idx on arch9_private.development_write_receipts(development_id);
revoke all on arch9_private.development_write_receipts from public, anon, authenticated;
grant select, insert on arch9_private.development_write_receipts to authenticated;
create policy development_receipt_read on arch9_private.development_write_receipts for select to authenticated
 using(actor_id=auth.uid() and public.bridge_can_manage_development_record(development_id));
create policy development_receipt_insert on arch9_private.development_write_receipts for insert to authenticated
 with check(actor_id=auth.uid() and public.bridge_can_manage_development_record(development_id));

create or replace function public.bridge_save_development_details(p_development_id uuid, p_request_id uuid, p_details jsonb, p_profile jsonb, p_expected_development_revision bigint, p_expected_profile_revision bigint)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare
 v_payload jsonb := jsonb_build_object('kind','details','details',p_details,'profile',p_profile,'developmentRevision',p_expected_development_revision,'profileRevision',p_expected_profile_revision);
 v_receipt arch9_private.development_write_receipts%rowtype;
 v_result jsonb;
 v_count integer;
 v_development_revision bigint; v_profile_revision bigint;
 v_columns text; v_assignments text; v_expressions text;
begin
 if auth.uid() is null or p_request_id is null or not coalesce(public.bridge_can_manage_development_record(p_development_id),false) then
  raise exception 'You do not have access to save this development.' using errcode='42501';
 end if;
 perform 1 from public.developments where id=p_development_id for no key update;
 if not found then raise exception 'Development is unavailable.' using errcode='42501'; end if;
 select * into v_receipt from arch9_private.development_write_receipts where request_id=p_request_id;
 if found then
  if v_receipt.actor_id<>auth.uid() or v_receipt.development_id<>p_development_id or v_receipt.payload is distinct from v_payload then
   raise exception 'This request was already used for different changes.' using errcode='22023';
  end if;
  return v_receipt.result;
 end if;

 select revision into v_development_revision from public.developments where id=p_development_id;
 select revision into v_profile_revision from public.development_profiles where development_id=p_development_id for update;
 if p_expected_development_revision is null or v_development_revision is distinct from p_expected_development_revision or v_profile_revision is distinct from p_expected_profile_revision then
  raise exception 'This development has changed. Refresh before saving.' using errcode='40001';
 end if;
 if jsonb_typeof(p_details) is distinct from 'object' or p_details='{}'::jsonb or jsonb_typeof(p_profile) is distinct from 'object' then
  raise exception 'Development details and profile are required.' using errcode='22023';
 end if;
 if p_profile ? 'development_id' and p_profile->>'development_id' is distinct from p_development_id::text then
  raise exception 'Invalid development profile.' using errcode='22023';
 end if;
 p_profile := p_profile-'development_id';
 if exists(select 1 from jsonb_object_keys(p_details) k where k not in ('name','planned_units','code','location','address','formatted_address','street_address','suburb','city','province','country','postal_code','latitude','longitude','google_place_id','description','status','developer_company','total_units_expected','launch_date','expected_completion_date','handover_enabled','snag_tracking_enabled','alterations_enabled','onboarding_enabled')) or
    exists(select 1 from jsonb_object_keys(p_profile) k where k not in ('code','location','suburb','city','province','country','address','formatted_address','street_address','postal_code','latitude','longitude','google_place_id','description','status','developer_company','launch_date','expected_completion_date','plans','site_plans','image_links','supporting_documents','seller_details','marketing_content')) or p_profile='{}'::jsonb then
  raise exception 'Invalid development save fields.' using errcode='22023';
 end if;
 select string_agg(format('%I=(jsonb_populate_record(null::public.developments,$1)).%I',k,k),',') into v_assignments from jsonb_object_keys(p_details) k;
 execute format('update public.developments set %s where id=$2 returning revision',v_assignments)
 into v_development_revision using p_details,p_development_id;
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'Development save was blocked.' using errcode='42501'; end if;
 select string_agg(format('%I',k),','),string_agg(format('(jsonb_populate_record(null::public.development_profiles,$1)).%I',k),','),
  string_agg(format('%I=excluded.%I',k,k),',') into v_columns,v_expressions,v_assignments from jsonb_object_keys(p_profile) k;
 execute format('insert into public.development_profiles(development_id,%s) select $2,%s on conflict(development_id) do update set %s where public.development_profiles.revision=$3 and $3 is not null returning revision',v_columns,v_expressions,v_assignments)
 into v_profile_revision using p_profile,p_development_id,p_expected_profile_revision;
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'Development profile changed or could not be saved.' using errcode='40001'; end if;
 if p_details ? 'snag_tracking_enabled' or p_details ? 'alterations_enabled' then
  insert into public.development_settings(development_id) values(p_development_id) on conflict(development_id) do nothing;
  update public.development_settings set
   snag_reporting_enabled=case when p_details ? 'snag_tracking_enabled' then (p_details->>'snag_tracking_enabled')::boolean else snag_reporting_enabled end,
   alteration_requests_enabled=case when p_details ? 'alterations_enabled' then (p_details->>'alterations_enabled')::boolean else alteration_requests_enabled end
  where development_id=p_development_id;
  get diagnostics v_count=row_count;
  if v_count<>1 then raise exception 'Development feature switches were blocked.' using errcode='42501'; end if;
 end if;
 v_result:=jsonb_build_object('requestId',p_request_id,'developmentId',p_development_id,'developmentRevision',v_development_revision,'profileRevision',v_profile_revision);
 insert into arch9_private.development_write_receipts(request_id,development_id,actor_id,payload,result)
 values(p_request_id,p_development_id,auth.uid(),v_payload,v_result);
 return v_result;
end; $$;
revoke all on function public.bridge_save_development_details(uuid,uuid,jsonb,jsonb,bigint,bigint) from public, anon;
grant execute on function public.bridge_save_development_details(uuid,uuid,jsonb,jsonb,bigint,bigint) to authenticated;

create or replace function public.bridge_save_development_unit_status(p_development_id uuid, p_request_id uuid, p_unit_id uuid, p_transaction_id uuid, p_expected_status text, p_status text, p_unit_patch jsonb, p_reservation_lead_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare
 v_payload jsonb := jsonb_build_object('kind','status','unit',p_unit_id,'transaction',p_transaction_id,'expectedStatus',p_expected_status,'status',p_status,'patch',p_unit_patch,'reservationLead',p_reservation_lead_id);
 v_receipt arch9_private.development_write_receipts%rowtype;
 v_result jsonb;
 v_count integer;
 v_unit public.units%rowtype; v_tx public.transactions%rowtype;
 v_stage text; v_phase text; v_assignments text; v_legacy text; v_active_ids uuid[]; v_lifecycle_receipt jsonb; v_reservation_receipt jsonb; v_previous_phase text;
begin
 if auth.uid() is null or p_request_id is null or not coalesce(public.bridge_can_manage_development_record(p_development_id),false) then
  raise exception 'You do not have access to save this development.' using errcode='42501';
 end if;
 perform 1 from public.developments where id=p_development_id for no key update;
 if not found then raise exception 'Development is unavailable.' using errcode='42501'; end if;
 select * into v_receipt from arch9_private.development_write_receipts where request_id=p_request_id;
 if found then
  if v_receipt.actor_id<>auth.uid() or v_receipt.development_id<>p_development_id or v_receipt.payload is distinct from v_payload then
   raise exception 'This request was already used for different changes.' using errcode='22023';
  end if;
  return v_receipt.result;
 end if;

 -- Match the active association before changing anything. An outdated browser
 -- must not update a transaction that has been replaced or cancelled.
 select array_agg(id) into v_active_ids from public.transactions t
 where t.unit_id=p_unit_id and t.development_id=p_development_id
  and coalesce((to_jsonb(t)->>'is_active')::boolean,true)
  and nullif(to_jsonb(t)->>'archived_at','') is null and nullif(to_jsonb(t)->>'cancelled_at','') is null and nullif(to_jsonb(t)->>'deleted_at','') is null
  and lower(coalesce(t.lifecycle_state,'')) not in ('archived','cancelled','canceled','deleted');
 if (p_transaction_id is null and cardinality(v_active_ids)>0) or
    (p_transaction_id is not null and (coalesce(cardinality(v_active_ids),0)<>1 or not(p_transaction_id=any(v_active_ids)))) then
  raise exception 'The linked transaction changed. Refresh this development.' using errcode='40001';
 end if;
 if p_transaction_id is not null then
  select * into v_tx from public.transactions where id=p_transaction_id and unit_id=p_unit_id and development_id=p_development_id for update;
  if not found then raise exception 'Linked transaction is unavailable.' using errcode='42501'; end if;
 end if;
 select * into v_unit from public.units where id=p_unit_id and development_id=p_development_id for update;
 if not found then raise exception 'Unit is unavailable.' using errcode='42501'; end if;
 if v_unit.status is distinct from p_expected_status then raise exception 'Unit status changed. Refresh before saving.' using errcode='40001'; end if;
 if p_status is null or p_status not in ('Available','Not Released','Blocked','Reserved','OTP Signed','Sold','Finance Pending','Proceed to Attorneys','Transfer in Progress','Registered','Complete') then
  raise exception 'Choose a supported stock status.' using errcode='22023';
 end if;
 if p_transaction_id is null and p_status not in ('Available','Not Released','Blocked') and p_status is distinct from v_unit.status then
  raise exception 'Reserve this unit for a buyer or create its transaction from a signed OTP first.' using errcode='23514';
 end if;
 if p_transaction_id is not null and p_status in ('Available','Not Released','Blocked') and p_status is distinct from v_unit.status then
  raise exception 'Release or cancel the linked transaction before changing its stock availability.' using errcode='23514';
 end if;
 if p_reservation_lead_id is not null then
  if p_transaction_id is not null then raise exception 'A linked transaction cannot release a lead reservation.' using errcode='23514'; end if;
  v_reservation_receipt:=public.bridge_set_development_lead_reservation(p_reservation_lead_id,p_unit_id,false);
  if v_reservation_receipt->>'developerLeadId' is distinct from p_reservation_lead_id::text or
     v_reservation_receipt->>'unitId' is distinct from p_unit_id::text or
     v_reservation_receipt->>'reservationState' is distinct from 'none' or
     v_reservation_receipt->>'unitStatus' is distinct from 'Available' then
   raise exception 'Reservation release could not be confirmed.' using errcode='42501';
  end if;
 elsif p_status is distinct from v_unit.status and exists(select 1 from public.developer_leads where preferred_unit_id=p_unit_id and reservation_state in ('reserved','expired') and converted_transaction_id is null) then
  raise exception 'Release the buyer reservation before changing this unit.' using errcode='23514';
 end if;
 if jsonb_typeof(p_unit_patch) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_unit_patch) k where k not in ('unit_number','unit_label','phase','block','unit_type','bedrooms','bathrooms','parking_count','size_sqm','list_price','current_price','price','status','vat_applicable','floorplan_id','structure_node_id','unit_type_id','catalogue_floorplan_id','notes')) then
  raise exception 'Invalid unit fields.' using errcode='22023';
 end if;
 if p_transaction_id is not null and p_status is distinct from v_unit.status then
  if p_status in ('Registered','Complete') then
   v_lifecycle_receipt:=public.bridge_commit_transaction_lifecycle(p_transaction_id,case when p_status='Registered' then 'register' else 'complete' end);
   if v_lifecycle_receipt->>'transactionId' is distinct from p_transaction_id::text then raise exception 'Registration could not be confirmed.' using errcode='42501'; end if;
  else
   if lower(coalesce(v_tx.lifecycle_state,'')) in ('registered','completed','terminated') or nullif(to_jsonb(v_tx)->>'registered_at','') is not null then
    raise exception 'Use the transaction workspace to change a registered or completed transaction.' using errcode='23514';
   end if;
   v_stage:=case p_status when 'Reserved' then 'confirmed' when 'OTP Signed' then 'otp' when 'Sold' then 'otp' when 'Finance Pending' then 'finance' else 'transfer' end;
   v_phase:=case v_stage when 'confirmed' then 'instruction' when 'otp' then 'instruction' when 'finance' then 'finance' else 'documents' end;
   v_legacy:=case p_status when 'Reserved' then 'DEP' when 'OTP Signed' then 'OTP' when 'Sold' then 'OTP' when 'Finance Pending' then 'FIN' when 'Proceed to Attorneys' then 'ATTY' else 'XFER' end;
   update public.transactions set current_main_stage=v_legacy,lifecycle_state='active',stage=p_status,updated_at=clock_timestamp() where id=p_transaction_id;
   get diagnostics v_count=row_count;
   if v_count<>1 then raise exception 'Linked transaction save was blocked.' using errcode='42501'; end if;
   select current_stage into v_previous_phase from public.transaction_lifecycle_workflows where transaction_id=p_transaction_id;
   insert into public.transaction_lifecycle_workflows(transaction_id,current_stage,status,last_updated_by,last_updated_at,completed_at)
   values(p_transaction_id,v_phase,'active',auth.uid(),clock_timestamp(),null)
   on conflict(transaction_id) do update set current_stage=excluded.current_stage,status=excluded.status,last_updated_by=excluded.last_updated_by,last_updated_at=excluded.last_updated_at,completed_at=null;
   get diagnostics v_count=row_count;
   if v_count<>1 then raise exception 'Lifecycle save was blocked.' using errcode='42501'; end if;
   insert into public.transaction_events(transaction_id,event_type,created_by,created_by_role,event_data)
   values(p_transaction_id,'TransactionLifecycleStageChanged',auth.uid(),public.bridge_current_profile_role(),jsonb_build_object('source','development_unit_status_quick_update','fromStage',v_previous_phase,'toStage',v_phase,'status','active','unitStatus',p_status,'message',format('Unit %s marked %s.',v_unit.unit_number,p_status)));
   get diagnostics v_count=row_count;
   if v_count<>1 then raise exception 'Lifecycle history save was blocked.' using errcode='42501'; end if;
  end if;
 end if;
 p_unit_patch:=p_unit_patch||jsonb_build_object('status',p_status);
 select string_agg(format('%I=(jsonb_populate_record(null::public.units,$1)).%I',k,k),',') into v_assignments from jsonb_object_keys(p_unit_patch) k;
 execute format('update public.units set %s where id=$2 and development_id=$3 returning *',v_assignments) into v_unit using p_unit_patch,p_unit_id,p_development_id;
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'Unit save was blocked.' using errcode='42501'; end if;
 if v_unit.status is distinct from p_status then raise exception 'Unit status save was not confirmed.' using errcode='23514'; end if;
 v_result:=jsonb_build_object('requestId',p_request_id,'developmentId',p_development_id,'unit',to_jsonb(v_unit),'transactionId',p_transaction_id,'reservation',v_reservation_receipt);
 insert into arch9_private.development_write_receipts(request_id,development_id,actor_id,payload,result)
 values(p_request_id,p_development_id,auth.uid(),v_payload,v_result);
 return v_result;
end; $$;
revoke all on function public.bridge_save_development_unit_status(uuid,uuid,uuid,uuid,text,text,jsonb,uuid) from public, anon;
grant execute on function public.bridge_save_development_unit_status(uuid,uuid,uuid,uuid,text,text,jsonb,uuid) to authenticated;

create or replace function public.bridge_create_development_units_batch(p_development_id uuid, p_request_id uuid, p_units jsonb)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare
 v_payload jsonb := jsonb_build_object('kind','bulk','units',p_units);
 v_receipt arch9_private.development_write_receipts%rowtype;
 v_result jsonb;
 v_count integer;
 v_units jsonb; v_size integer;
begin
 if auth.uid() is null or p_request_id is null or not coalesce(public.bridge_can_manage_development_record(p_development_id),false) then
  raise exception 'You do not have access to save this development.' using errcode='42501';
 end if;
 perform 1 from public.developments where id=p_development_id for no key update;
 if not found then raise exception 'Development is unavailable.' using errcode='42501'; end if;
 select * into v_receipt from arch9_private.development_write_receipts where request_id=p_request_id;
 if found then
  if v_receipt.actor_id<>auth.uid() or v_receipt.development_id<>p_development_id or v_receipt.payload is distinct from v_payload then
   raise exception 'This request was already used for different changes.' using errcode='22023';
  end if;
  return v_receipt.result;
 end if;

 if jsonb_typeof(p_units) is distinct from 'array' or jsonb_array_length(p_units)=0 then
  raise exception 'Generate at least one unit before saving.' using errcode='22023'; end if;
 v_size:=jsonb_array_length(p_units);
 if exists(select 1 from jsonb_array_elements(p_units) r where jsonb_typeof(r) is distinct from 'object' or nullif(btrim(r->>'unitNumber'),'') is null or coalesce(r->>'status','Available') not in ('Available','Not Released','Blocked')) then
  raise exception 'Every row needs a unit number and an initial stock availability status.' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_units) r group by lower(btrim(r->>'unitNumber')) having count(*)>1) or exists(
  select 1 from jsonb_array_elements(p_units) r join public.units u on u.development_id=p_development_id and lower(btrim(u.unit_number))=lower(btrim(r->>'unitNumber'))) then
  raise exception 'One or more unit numbers already exist. Review the latest stock before retrying.' using errcode='23505'; end if;
 with requested as (select r,ord from jsonb_array_elements(p_units) with ordinality x(r,ord)), inserted as (
  insert into public.units(development_id,unit_number,unit_label,phase,block,unit_type,bedrooms,list_price,current_price,price,status,vat_applicable,notes)
  select p_development_id,btrim(r->>'unitNumber'),coalesce(nullif(r->>'unitLabel',''),btrim(r->>'unitNumber')),nullif(r->>'phase',''),nullif(r->>'block',''),nullif(r->>'unitType',''),
   nullif(r->>'bedrooms','')::numeric,coalesce(nullif(r->>'listPrice','')::numeric,0),null,coalesce(nullif(r->>'listPrice','')::numeric,0),coalesce(r->>'status','Available'),
   nullif(r->>'vatApplicable','')::boolean,nullif(r->>'notes','')
  from requested
  returning *
 ) select jsonb_agg(to_jsonb(inserted) order by requested.ord) into v_units from inserted
 join requested on btrim(requested.r->>'unitNumber')=inserted.unit_number;
 if coalesce(jsonb_array_length(v_units),0)<>v_size then raise exception 'The complete batch could not be saved. No units were added.' using errcode='42501'; end if;
 v_result:=jsonb_build_object('requestId',p_request_id,'developmentId',p_development_id,'units',v_units);
 insert into arch9_private.development_write_receipts(request_id,development_id,actor_id,payload,result)
 values(p_request_id,p_development_id,auth.uid(),v_payload,v_result);
 return v_result;
end; $$;
revoke all on function public.bridge_create_development_units_batch(uuid,uuid,jsonb) from public, anon;
grant execute on function public.bridge_create_development_units_batch(uuid,uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
