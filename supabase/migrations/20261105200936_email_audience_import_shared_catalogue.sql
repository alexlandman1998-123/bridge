begin;
-- Compatible with both the original catalogue and the shared-catalogue view.
create or replace function private.email_import_audience(p_org uuid,p_request uuid,p_name text,p_subscription uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; address text; contact_id uuid; ids uuid[]:='{}'; inserted_count integer:=0;
 added boolean; preference text; consent text; captured timestamptz; receipt jsonb; previous public.email_audience_imports;
 audience_id uuid; fingerprint text;
begin
 if auth.uid() is null or public.bridge_is_active_member(p_org) is not true or public.email_campaign_can_send(p_org) is not true then
  raise exception 'Only an active organisation sender can import audiences.' using errcode='42501';
 end if;
 if p_request is null or length(btrim(coalesce(p_name,''))) not between 1 and 140 or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Choose an import name and contact rows.'; end if;
 if jsonb_array_length(p_rows) not between 1 and 1000 or octet_length(p_rows::text)>5242880 then raise exception 'Import 1 to 1,000 contacts per file (up to 5 MiB).'; end if;
 if not exists(select 1 from public.email_subscription_types where id=p_subscription and organisation_id=p_org and is_active) then raise exception 'Choose an active email category in this organisation.'; end if;
 fingerprint:=md5(btrim(p_name)||p_subscription::text||p_rows::text);
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 select * into previous from public.email_audience_imports where organisation_id=p_org and request_id=p_request;
 if found then
  if previous.payload_hash<>fingerprint then raise exception 'This import request was already used for another file.'; end if;
  return previous.result;
 end if;
 if (select count(distinct lower(btrim(value->>'email'))) from jsonb_array_elements(p_rows))<>jsonb_array_length(p_rows) then raise exception 'Remove duplicate email addresses before importing.'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  address:=lower(btrim(coalesce(r->>'email','')));
  if length(address)>254 or address !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' then raise exception 'A contact has an invalid email address.'; end if;
  if length(coalesce(r->>'firstName',''))>120 or length(coalesce(r->>'lastName',''))>120 or length(coalesce(r->>'area',''))>160 or length(coalesce(r->>'roleType',''))>80 or length(coalesce(r->>'consentSource',''))>500 then raise exception 'A contact field exceeds the import limit.'; end if;
  consent:=coalesce(nullif(r->>'consent',''),'unknown');
  if consent not in ('unknown','opted_in','opted_out') then raise exception 'Choose a valid permission status.'; end if;
  captured:=null;
  if consent='opted_in' then
   if nullif(btrim(r->>'consentSource'),'') is null or coalesce(r->>'consentAt','') !~ '^\d{4}-\d{2}-\d{2}T' then raise exception 'Opted-in contacts require a permission source and recorded date.'; end if;
   captured:=(r->>'consentAt')::timestamptz;
   if captured>now() then raise exception 'Permission dates cannot be in the future.'; end if;
  end if;
  insert into public.email_marketing_contacts(organisation_id,source_type,email,first_name,last_name,full_name,area,role_type,is_valid_email)
   values(p_org,'csv',address,nullif(btrim(r->>'firstName'),''),nullif(btrim(r->>'lastName'),''),nullif(btrim(concat_ws(' ',r->>'firstName',r->>'lastName')),''),nullif(btrim(r->>'area'),''),nullif(btrim(r->>'roleType'),''),true)
   on conflict(organisation_id,email) do nothing returning id into contact_id;
  added:=found;
  if added then
   inserted_count:=inserted_count+1;
   insert into public.email_marketing_contact_sources(organisation_id,marketing_contact_id,source_kind,source_id,source_snapshot)
    values(p_org,contact_id,'csv_import',gen_random_uuid(),jsonb_build_object('importRequestId',p_request));
  else select id into contact_id from public.email_marketing_contacts where organisation_id=p_org and email=address; end if;
  ids:=array_append(ids,contact_id);
  -- Existing consent and subscription decisions are never replaced by an import.
  insert into public.contact_marketing_preferences(organisation_id,email,marketing_consent_status,consent_source,consent_captured_at,unsubscribed_at)
   values(p_org,address,consent,nullif(btrim(r->>'consentSource'),''),captured,case when consent='opted_out' then now() end)
   on conflict(organisation_id,email) do nothing;
  -- A file's opt-out always wins; an opt-in never revives an existing opt-out.
  if consent='opted_out' then
   update public.contact_marketing_preferences set marketing_consent_status='opted_out',unsubscribed_at=coalesce(unsubscribed_at,now()) where organisation_id=p_org and email=address;
  end if;
  select marketing_consent_status into preference from public.contact_marketing_preferences where organisation_id=p_org and email=address;
  if consent='opted_in' and preference='opted_in' then
   insert into public.contact_email_subscriptions(organisation_id,subscription_type_id,email,status,source,consent_captured_at)
    values(p_org,p_subscription,address,'subscribed','audience_import',captured) on conflict(organisation_id,subscription_type_id,email) do nothing;
  end if;
 end loop;
 if (select relkind from pg_catalog.pg_class where oid=to_regclass('public.email_saved_audiences'))='v' then
  -- The shared catalogue exposes a read-only compatibility view. Write its
  -- canonical table instead, preserving exactly the imported contact IDs.
  execute 'insert into public.marketing_audiences(organisation_id,name,description,visibility,definition,created_by) values($1,$2,$3,$4,$5,$6) returning id'
   into audience_id using p_org,btrim(p_name),'Imported marketing contacts','personal',jsonb_build_object('emailFilter',jsonb_build_object('contact_ids',to_jsonb(ids))),auth.uid();
 else
  insert into public.email_saved_audiences(organisation_id,name,description,filter_json,created_by)
   values(p_org,btrim(p_name),'Imported marketing contacts',jsonb_build_object('contact_ids',to_jsonb(ids)),auth.uid()) returning id into audience_id;
 end if;
 receipt:=jsonb_build_object('audienceId',audience_id,'name',btrim(p_name),'contactIds',to_jsonb(ids),'added',inserted_count,'existing',cardinality(ids)-inserted_count,'total',cardinality(ids),'eligible',public.email_campaign_preview_audience(p_org,p_subscription,jsonb_build_object('contact_ids',to_jsonb(ids))));
 insert into public.email_audience_imports(organisation_id,request_id,created_by,payload_hash,result) values(p_org,p_request,auth.uid(),fingerprint,receipt);
 return receipt;
end $$;
commit;
