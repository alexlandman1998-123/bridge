begin;

-- A read-only snapshot for professional workspaces. Portal projections retain
-- their token/role authority below; this RPC cannot be used with a portal token.
create function document_requirement_private.read_context(p_context_type text,p_context_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_requirements jsonb; v_documents jsonb; v_role text; v_allowed boolean; v_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Sign in to read this workspace.' using errcode='42501'; end if;
  select lower(role) into v_role from public.profiles where id=auth.uid();
  if coalesce(v_role,'') not in ('agent','agency_admin','developer','internal_admin','admin','attorney','conveyancer','transferring_attorney','bond_attorney','cancellation_attorney','platform_admin','bond_originator','legal_secretary','secretary','admin_staff','candidate_attorney','conveyancing_secretary') then
    raise exception 'A professional workspace account is required.' using errcode='42501';
  end if;
  v_allowed:=document_requirement_private.can_manage(p_context_type,p_context_id);
  if p_context_type='transaction' then v_allowed:=v_allowed or public.bridge_can_access_transaction_spine(p_context_id); end if;
  if not coalesce(v_allowed,false) then raise exception 'Not authorised to read these requirements.' using errcode='42501'; end if;
  -- Resolve a small set of explicit contexts first, then use the context-link
  -- index. Do not scan every requirement to find matching people or properties.
  with contexts(context_type,context_id,direct,listing_id,transaction_id) as (
    select p_context_type,p_context_id,true,null::uuid,null::uuid
    union
    select 'seller_lead',lead.lead_id,false,listing.id,null::uuid
    from public.private_listings listing join public.leads lead on lead.organisation_id=listing.organisation_id
      and lead.lead_id::text in (listing.seller_lead_id,listing.originating_crm_lead_id) and lead.lead_category='seller'
    where p_context_type='private_listing' and listing.id=p_context_id
    union
    select 'private_listing',listing.id,false,listing.id,null::uuid
    from public.leads lead join public.private_listings listing on listing.organisation_id=lead.organisation_id
      and lead.lead_id::text in (listing.seller_lead_id,listing.originating_crm_lead_id)
    where p_context_type='seller_lead' and lead.lead_id=p_context_id and lead.lead_category='seller'
    union
    select 'buyer_lead',lead.lead_id,false,null::uuid,t.id
    from public.transactions t join public.leads lead on lead.organisation_id=t.organisation_id and lead.lead_category='buyer'
      and lead.lead_id::text in (to_jsonb(t)->>'originating_buyer_lead_id',to_jsonb(t)->>'originating_lead_id')
    where p_context_type='transaction' and t.id=p_context_id
    union
    select 'private_listing',listing.id,false,listing.id,t.id
    from public.transactions t join public.private_listings listing on listing.organisation_id=t.organisation_id
      and listing.id::text in (to_jsonb(t)->>'private_listing_id',to_jsonb(t)->>'listing_id')
    where p_context_type='transaction' and t.id=p_context_id
    union
    select 'seller_lead',lead.lead_id,false,listing.id,t.id
    from public.transactions t join public.private_listings listing on listing.organisation_id=t.organisation_id
      and listing.id::text in (to_jsonb(t)->>'private_listing_id',to_jsonb(t)->>'listing_id')
    join public.leads lead on lead.organisation_id=listing.organisation_id and lead.lead_category='seller'
      and lead.lead_id::text in (listing.seller_lead_id,listing.originating_crm_lead_id)
    where p_context_type='transaction' and t.id=p_context_id
  )
  select coalesce(array_agg(distinct r.id),'{}'::uuid[]) into v_ids from contexts c
    join public.document_requirement_context_links l using(context_type,context_id)
    join public.document_requirement_instances r on r.id=l.requirement_instance_id
    where c.direct or r.transaction_id is null or r.transaction_id=c.transaction_id
      or (c.transaction_id is null and c.listing_id is not null and exists(
        select 1 from public.transactions t join public.private_listings listing on listing.id=c.listing_id
          and listing.organisation_id=t.organisation_id
        where t.id=r.transaction_id and listing.id::text in (to_jsonb(t)->>'private_listing_id',to_jsonb(t)->>'listing_id')));
  if exists(select 1 from public.document_requirement_instances r where r.id=any(v_ids) and r.transaction_id is null
    and not document_requirement_private.can_manage(r.context_type,r.context_id)) then
    raise exception 'Not authorised to read the linked source workspace.' using errcode='42501';
  end if;
  -- Never let a source lead expose its handed-over matter after access changes.
  if exists(select 1 from public.document_requirement_instances r where r.id=any(v_ids) and r.transaction_id is not null
    and not coalesce(document_requirement_private.can_manage('transaction',r.transaction_id) or public.bridge_can_access_transaction_spine(r.transaction_id),false)) then
    raise exception 'Not authorised to read the linked transaction.' using errcode='42501';
  end if;
  -- Match the professional register's audience aliases; being able to open a
  -- matter does not make every requirement visible to every professional.
  v_role:=case when v_role='agency_admin' then 'agent'
    when v_role in ('internal_admin','admin','platform_admin') then 'internal_admin'
    when v_role in ('attorney','conveyancer','transferring_attorney','bond_attorney','cancellation_attorney','legal_secretary','secretary','admin_staff','candidate_attorney','conveyancing_secretary') then 'transfer_attorney'
    else v_role end;
  select coalesce(array_agg(r.id),'{}'::uuid[]) into v_ids from public.document_requirement_instances r
    where r.id=any(v_ids) and (v_role='internal_admin' or exists(
      select 1 from unnest(r.visible_to_roles) audience(role) where lower(audience.role)=v_role
        or (v_role='agent' and lower(audience.role) in ('agency','agency_admin'))
        or (v_role='transfer_attorney' and lower(audience.role) in ('attorney','transferring_attorney','conveyancer','conveyancing_secretary','bond_attorney','cancellation_attorney'))));
  select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('document_definitions',to_jsonb(d),'document_packs',to_jsonb(p)) order by r.pack_key,r.id),'[]'::jsonb)
    into v_requirements from public.document_requirement_instances r
    left join public.document_definitions d on d.key=r.document_definition_key
    left join public.document_packs p on p.key=r.pack_key where r.id=any(v_ids);
  -- Storage paths are returned only when the existing document audience allows
  -- them. For pre-transaction files, the context check is their access boundary.
  select coalesce(jsonb_agg(item order by item->>'id'),'[]'::jsonb) into v_documents from (
    select to_jsonb(d)||jsonb_build_object('requirement_status',r.status,'requirement_label',coalesce(r.custom_label,def.display_label),
      'is_current_evidence',d.id=r.satisfied_by_document_id,'applicability_override',r.applicability_override) item
    from public.document_requirement_instances r
    join public.documents d on d.canonical_requirement_instance_id=r.id or
      (d.id=r.satisfied_by_document_id and d.canonical_requirement_instance_id is null)
    left join public.document_definitions def on def.key=r.document_definition_key
    where r.id=any(v_ids) and d.transaction_id=r.transaction_id and document_security.can_read(d)
    union all
    select jsonb_build_object('id',u.id,'name',u.file_name,'file_name',u.file_name,'file_path',u.file_path,'file_bucket','documents',
      'created_at',u.created_at,'uploaded_at',u.created_at,'canonical_requirement_instance_id',r.id,
      'document_type',coalesce(r.document_definition_key,'custom_'||r.id),'requirement_label',coalesce(r.custom_label,def.display_label),
      'requirement_status',r.status,'status',r.status,'review_status',r.status,'is_current_evidence',u.id=r.latest_upload_id,
      'applicability_override',r.applicability_override,'source','document_requirement_command',
      'client_recipient_role',r.requested_from_role,'is_client_visible',true,'visibility_scope','client_visible')
    from document_requirement_private.uploads u join public.document_requirement_instances r on r.id=u.requirement_id
    left join public.document_definitions def on def.key=r.document_definition_key
    where r.id=any(v_ids) and u.document_id is null and r.transaction_id is null
  ) evidence;
  return jsonb_build_object('contextType',p_context_type,'contextId',p_context_id,'requirements',v_requirements,'documents',v_documents,
    'version',coalesce((select version from document_requirement_private.context_versions where context_type=p_context_type and context_id=p_context_id),0));
end;
$$;
revoke all on function document_requirement_private.read_context(text,uuid) from public,anon,authenticated;
grant execute on function document_requirement_private.read_context(text,uuid) to authenticated;
create function public.bridge_document_requirement_context(p_context_type text,p_context_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select document_requirement_private.read_context(p_context_type,p_context_id);
$$;
revoke all on function public.bridge_document_requirement_context(text,uuid) from public,anon,authenticated;
grant execute on function public.bridge_document_requirement_context(text,uuid) to authenticated;

-- Keep both established authorisation bodies intact. Only enrich their output
-- and allow a local custom definition (which deliberately has no catalogue row).
do $patch$
declare body text; signature text;
begin
  foreach signature in array array['public.bridge_client_portal_canonical_document_projection()',
    'public.bridge_transaction_document_projection(uuid,text,text)'] loop
    select pg_get_functiondef(signature::regprocedure) into body;
    if signature like '%client_portal%' then
      if position('join public.document_definitions definition on definition.key = requirement.document_definition_key' in body)=0 then
        raise exception 'Unexpected buyer document projection; review before applying.'; end if;
      body:=replace(body,'join public.document_definitions definition on definition.key = requirement.document_definition_key',
        'left join public.document_definitions definition on definition.key = requirement.document_definition_key');
      body:=replace(body,'definition.display_label as definition_display_label','coalesce(requirement.custom_label, definition.display_label) as definition_display_label');
      body:=replace(body,'''id'', projected.id,', '''id'', projected.id, ''custom_label'', projected.custom_label, ''requirement_origin'', projected.requirement_origin, ''command_revision'', projected.command_revision, ''requested_from_contact_id'', projected.requested_from_contact_id,');
    else
      if position('join public.document_definitions d on d.key = r.document_definition_key' in body)=0 then
        raise exception 'Unexpected transaction document projection; review before applying.'; end if;
      body:=replace(body,'join public.document_definitions d on d.key = r.document_definition_key',
        'left join public.document_definitions d on d.key = r.document_definition_key');
      body:=replace(body,'d.display_label as definition_label','coalesce(r.custom_label, d.display_label) as definition_label');
      body:=replace(body,'''id'', q.id,', '''id'', q.id, ''custom_label'', q.custom_label, ''requirement_origin'', q.requirement_origin, ''command_revision'', q.command_revision, ''requested_from_contact_id'', q.requested_from_contact_id,');
    end if;
    execute body;
  end loop;
end;
$patch$;
notify pgrst,'reload schema';
commit;
