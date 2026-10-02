begin;

-- Transaction-local identity details. Shared buyer profiles and partner
-- assignments are deliberately outside this correction boundary.
alter table public.transactions add column if not exists deal_review_details jsonb not null default '{}'::jsonb
  check (jsonb_typeof(deal_review_details) = 'object');
create schema if not exists deal_review_private;
revoke all on schema deal_review_private from public, anon, authenticated;

create table deal_review_private.sections (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  section text not null check (section in ('buyer','seller','property','attorney')),
  revision bigint not null default 0,
  details jsonb not null default '{}'::jsonb,
  captured_snapshot jsonb not null,
  confirmed_snapshot jsonb,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  source_document_id uuid references public.documents(id) on delete set null,
  source_signature jsonb,
  primary key (transaction_id, section)
);
create table deal_review_private.events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  section text not null check (section in ('buyer','seller','property','attorney')),
  actor_id uuid not null references auth.users(id),
  actor_name text not null,
  action text not null check (action in ('draft_saved','confirmed')),
  previous_snapshot jsonb not null,
  saved_snapshot jsonb not null,
  source_document_id uuid,
  recorded_at timestamptz not null default now()
);
create index on deal_review_private.events(transaction_id, recorded_at desc);
alter table deal_review_private.sections enable row level security;
alter table deal_review_private.events enable row level security;
revoke all on all tables in schema deal_review_private from public, anon, authenticated;

create function deal_review_private.can_review(p_transaction_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and (public.bridge_can_access_transaction_spine(p_transaction_id)
      or public.bridge_can_access_transaction_org_member(p_transaction_id))
    and (public.bridge_has_transaction_permission(p_transaction_id, 'edit_core_transaction')
      or exists (select 1 from public.transactions t join public.organisation_users m on m.organisation_id=t.organisation_id
        where t.id=p_transaction_id and m.user_id=auth.uid()
          and m.status in ('active','accepted')
          and m.role in ('super_admin','principal','admin','branch_manager','developer','agent')));
$$;

create function deal_review_private.snapshot(p_transaction_id uuid, p_section text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.transactions%rowtype; p public.transaction_participants%rowtype; b public.buyers%rowtype; extra jsonb; primary_count integer;
begin
  select * into t from public.transactions where id=p_transaction_id;
  if not found then raise exception 'Transaction not found.' using errcode='P0002'; end if;
  select details into extra from deal_review_private.sections where transaction_id=t.id and section=p_section;
  extra := coalesce(extra,'{}'::jsonb);
  if p_section='buyer' then
    select count(*) into primary_count from public.transaction_participants
      where transaction_id=t.id and transaction_role='buyer' and removed_at is null and is_primary_buyer is true;
    if primary_count=1 then
      select * into p from public.transaction_participants where transaction_id=t.id and transaction_role='buyer' and removed_at is null and is_primary_buyer is true;
    end if;
    select * into b from public.buyers where id=coalesce(p.buyer_party_id,t.buyer_id);
    -- Identity extras belong to the exact buyer assignment they were saved for.
    if coalesce(extra->>'profileId','')<>coalesce(t.buyer_id::text,'') or coalesce(extra->>'participantId','')<>coalesce(p.id::text,'') then extra:='{}'::jsonb; end if;
    return jsonb_build_object('name',coalesce(p.participant_name,t.buyer_name,b.name,''),
      'email',coalesce(p.participant_email,extra->>'email',b.email,''), 'phone',coalesce(p.participant_phone,extra->>'phone',b.phone,''),
      'identityNumber',coalesce(extra->>'identityNumber',''), 'residentialAddress',coalesce(extra->>'residentialAddress',''),
      'purchaserType',coalesce(t.purchaser_type,''), 'participantId',coalesce(p.id::text,''),
      'buyerProfileId',coalesce(p.buyer_party_id::text,''), 'capturedBuyerId',coalesce(t.buyer_id::text,''),
      'linkedProfileName',coalesce(b.name,''), 'primaryCount',primary_count, 'savedPrimaryId',coalesce(t.primary_buyer_participant_id::text,''));
  elsif p_section='seller' then
    return jsonb_build_object('name',coalesce(t.seller_name,''),'email',coalesce(t.seller_email,''),'phone',coalesce(t.seller_phone,''),
      'entityType',coalesce(t.seller_type,''),'identityNumber',coalesce(extra->>'identityNumber',''),'address',coalesce(extra->>'address',''));
  elsif p_section='property' then
    return jsonb_build_object('addressLine1',coalesce(t.property_address_line_1,''),'addressLine2',coalesce(t.property_address_line_2,''),
      'suburb',coalesce(t.suburb,''),'city',coalesce(t.city,''),'province',coalesce(t.province,''),'postalCode',coalesce(t.postal_code,''),
      'description',coalesce(t.property_description,''),'erfUnit',coalesce(extra->>'erfUnit',''),
      'developmentId',coalesce(t.development_id::text,''),'unitId',coalesce(t.unit_id::text,''));
  elsif p_section='attorney' then
    return jsonb_build_object('firmName',coalesce(extra->>'firmName',t.attorney,''),'contactName',coalesce(extra->>'contactName',''),
      'email',coalesce(extra->>'email',t.assigned_attorney_email,''),'phone',coalesce(extra->>'phone',''),'reference',coalesce(extra->>'reference',''),
      'assignedFirmName',coalesce(t.attorney,''),'assignedEmail',coalesce(t.assigned_attorney_email,''));
  end if;
  raise exception 'Unknown review section.' using errcode='22023';
end;
$$;

create function deal_review_private.document_signature(p_transaction_id uuid,p_document_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',d.id,'path',d.file_path,'bucket',coalesce(nullif(d.file_bucket,''),'documents'),'storageUpdatedAt',o.updated_at)
  from public.documents d join storage.objects o on o.name=d.file_path and o.bucket_id=coalesce(nullif(d.file_bucket,''),'documents')
  where d.id=p_document_id and d.transaction_id=p_transaction_id
    and lower(coalesce(nullif(d.file_name,''),nullif(d.name,''),d.file_path,'')) like '%.pdf';
$$;

create function public.bridge_get_transaction_detail_review(p_transaction_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; sections jsonb:='[]'; k text; current_values jsonb; r deal_review_private.sections%rowtype; signature jsonb;
begin
  if not deal_review_private.can_review(p_transaction_id) then raise exception 'Deal review requires an authorised transaction operator.' using errcode='42501'; end if;
  foreach k in array array['buyer','seller','property','attorney'] loop
    current_values:=deal_review_private.snapshot(p_transaction_id,k);
    select * into r from deal_review_private.sections where transaction_id=p_transaction_id and section=k;
    signature:=deal_review_private.document_signature(p_transaction_id,r.source_document_id);
    sections:=sections || jsonb_build_array(jsonb_build_object('key',k,'revision',coalesce(r.revision,0),
      'currentSnapshot',current_values,'capturedSnapshot',coalesce(r.captured_snapshot,current_values),
      'status',case when r.confirmed_at is not null and r.confirmed_snapshot=current_values and signature is not null and r.source_signature=signature then 'confirmed' else 'needs_review' end,
      'confirmedBy',r.confirmed_by,'confirmedAt',r.confirmed_at,'sourceDocumentId',r.source_document_id));
  end loop;
  select jsonb_build_object('transactionId',t.id,'reference',t.transaction_reference,'importComment',t.comment,
    'originSource',t.transaction_origin_source,'saleDate',t.sale_date,'stage',t.stage,'sections',sections,
    'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',coalesce(d.file_name,d.name),'filePath',d.file_path,
      'bucket',coalesce(nullif(d.file_bucket,''),'documents'),'available',deal_review_private.document_signature(t.id,d.id) is not null) order by d.created_at)
      from public.documents d where d.transaction_id=t.id and lower(coalesce(nullif(d.file_name,''),nullif(d.name,''),d.file_path,'')) like '%.pdf'),'[]'),
    'history',coalesce((select jsonb_agg(to_jsonb(e) order by e."recordedAt" desc,e.id desc) from (
      select id,section,action,actor_name as "actorName",recorded_at as "recordedAt",previous_snapshot as "previousSnapshot",saved_snapshot as "savedSnapshot",source_document_id as "sourceDocumentId"
      from deal_review_private.events where transaction_id=t.id order by recorded_at desc,id desc limit 50) e),'[]')) into result
    from public.transactions t where t.id=p_transaction_id;
  return result;
end;
$$;

create function public.bridge_save_transaction_detail_review(
  p_transaction_id uuid, p_section text, p_details jsonb, p_expected_snapshot jsonb, p_expected_revision bigint,
  p_confirm boolean default false, p_source_document_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.transactions%rowtype; r deal_review_private.sections%rowtype; previous_values jsonb; saved_values jsonb;
  fields text[]; normalized jsonb:='{}'; key text; value text; extras jsonb; signature jsonb; primary_id uuid; actor_name text;
begin
  if not deal_review_private.can_review(p_transaction_id) then raise exception 'Deal review requires an authorised transaction operator.' using errcode='42501'; end if;
  fields:=case p_section when 'buyer' then array['name','email','phone','identityNumber','residentialAddress','purchaserType']
    when 'seller' then array['name','email','phone','entityType','identityNumber','address']
    when 'property' then array['addressLine1','addressLine2','suburb','city','province','postalCode','description','erfUnit']
    when 'attorney' then array['firmName','contactName','email','phone','reference'] end;
  if fields is null or jsonb_typeof(p_details) is distinct from 'object' then raise exception 'Valid review details are required.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_details) f where not f=any(fields)) then raise exception 'Unsupported review field.' using errcode='22023'; end if;
  foreach key in array fields loop
    if not p_details ? key or jsonb_typeof(p_details->key)<>'string' then raise exception 'Every review field must be provided as text.' using errcode='22023'; end if;
    value:=btrim(p_details->>key);
    if length(value)>1000 then raise exception 'Review fields must be at most 1000 characters.' using errcode='22023'; end if;
    normalized:=normalized || jsonb_build_object(key,value);
  end loop;
  if normalized ? 'email' and normalized->>'email'<>'' and normalized->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.' using errcode='22023'; end if;
  select * into t from public.transactions where id=p_transaction_id for update;
  perform 1 from public.transaction_participants where transaction_id=p_transaction_id and transaction_role='buyer' and removed_at is null for update;
  previous_values:=deal_review_private.snapshot(p_transaction_id,p_section);
  select * into r from deal_review_private.sections where transaction_id=p_transaction_id and section=p_section for update;
  if p_expected_snapshot is null or previous_values<>p_expected_snapshot or p_expected_revision is distinct from coalesce(r.revision,0) then
    raise exception 'Details changed since you opened this section. Reload and compare your changes before saving.' using errcode='40001';
  end if;
  if p_source_document_id is not null then signature:=deal_review_private.document_signature(p_transaction_id,p_source_document_id); end if;
  if p_source_document_id is not null and signature is null then raise exception 'The source PDF is unavailable or belongs to another transaction.' using errcode='22023'; end if;
  if p_confirm and signature is null then raise exception 'A linked, available source PDF is required before confirmation.' using errcode='22023'; end if;
  if p_confirm and ((p_section in ('buyer','seller') and normalized->>'name'='') or (p_section='property' and normalized->>'addressLine1'='') or (p_section='attorney' and normalized->>'firmName'='')) then
    raise exception 'Complete the section identity before confirming it.' using errcode='22023';
  end if;
  if p_section='buyer' and p_confirm and ((previous_values->>'primaryCount')::integer<>1
    or (previous_values->>'capturedBuyerId'<>'' and previous_values->>'buyerProfileId'<>previous_values->>'capturedBuyerId')
    or (previous_values->>'savedPrimaryId'<>'' and previous_values->>'savedPrimaryId'<>previous_values->>'participantId')) then
    raise exception 'Resolve the primary buyer links in Deal Setup before confirming this section.' using errcode='22023';
  end if;
  if p_section='buyer' and normalized->>'purchaserType' not in ('individual','married_coc','company','trust') then raise exception 'Choose a valid purchaser type.' using errcode='22023'; end if;
  if p_section='buyer' then
    normalized:=normalized || jsonb_build_object('profileId',coalesce(t.buyer_id::text,''),'participantId',previous_values->>'participantId');
  end if;
  insert into deal_review_private.sections(transaction_id,section,details,captured_snapshot)
    values(t.id,p_section,normalized,previous_values)
    on conflict(transaction_id,section) do update set details=excluded.details;
  extras:=coalesce(t.deal_review_details,'{}');
  if p_section='buyer' then
    primary_id:=nullif(previous_values->>'participantId','')::uuid;
    if primary_id is not null then update public.transaction_participants set participant_name=normalized->>'name',participant_email=nullif(normalized->>'email',''),participant_phone=nullif(normalized->>'phone',''),updated_at=now() where id=primary_id; end if;
    extras:=jsonb_set(extras,array['buyer'],jsonb_build_object('profileId',coalesce(t.buyer_id::text,''),'participantId',coalesce(primary_id::text,''),'savedPrimaryId',coalesce(t.primary_buyer_participant_id::text,'')),true);
    update public.transactions set buyer_name=normalized->>'name',purchaser_type=normalized->>'purchaserType',deal_review_details=extras,updated_at=now() where id=t.id;
  elsif p_section='seller' then
    update public.transactions set seller_name=nullif(normalized->>'name',''),seller_email=nullif(normalized->>'email',''),seller_phone=nullif(normalized->>'phone',''),seller_type=nullif(normalized->>'entityType',''),updated_at=now() where id=t.id;
  elsif p_section='property' then
    update public.transactions set property_address_line_1=nullif(normalized->>'addressLine1',''),property_address_line_2=nullif(normalized->>'addressLine2',''),
      suburb=nullif(normalized->>'suburb',''),city=nullif(normalized->>'city',''),province=nullif(normalized->>'province',''),postal_code=nullif(normalized->>'postalCode',''),
      property_description=nullif(normalized->>'description',''),updated_at=now() where id=t.id;
  else
    -- Captured attorney details must not grant account access or reassign a firm.
    update public.transactions set updated_at=now() where id=t.id;
  end if;
  saved_values:=deal_review_private.snapshot(p_transaction_id,p_section);
  insert into deal_review_private.sections(transaction_id,section,revision,captured_snapshot,confirmed_snapshot,confirmed_by,confirmed_at,source_document_id,source_signature)
    values(t.id,p_section,1,previous_values,case when p_confirm then saved_values end,case when p_confirm then auth.uid() end,case when p_confirm then now() end,p_source_document_id,signature)
    on conflict(transaction_id,section) do update set revision=deal_review_private.sections.revision+1,
      confirmed_snapshot=excluded.confirmed_snapshot,confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,
      source_document_id=excluded.source_document_id,source_signature=excluded.source_signature;
  select coalesce(nullif(p.full_name,''),'Transaction operator') into actor_name from public.profiles p where p.id=auth.uid();
  insert into deal_review_private.events(transaction_id,section,actor_id,actor_name,action,previous_snapshot,saved_snapshot,source_document_id)
    values(t.id,p_section,auth.uid(),coalesce(actor_name,'Transaction operator'),case when p_confirm then 'confirmed' else 'draft_saved' end,previous_values,saved_values,p_source_document_id);
  return public.bridge_get_transaction_detail_review(t.id);
end;
$$;

revoke all on all functions in schema deal_review_private from public, anon, authenticated;
revoke all on function public.bridge_get_transaction_detail_review(uuid) from public, anon;
revoke all on function public.bridge_save_transaction_detail_review(uuid,text,jsonb,jsonb,bigint,boolean,uuid) from public, anon;
grant execute on function public.bridge_get_transaction_detail_review(uuid) to authenticated;
grant execute on function public.bridge_save_transaction_detail_review(uuid,text,jsonb,jsonb,bigint,boolean,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
