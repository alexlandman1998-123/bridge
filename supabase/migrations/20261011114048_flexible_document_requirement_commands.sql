begin;

-- Stage 2: shared commands. No email is sent by these operations.
alter table public.document_requirement_instances add column command_revision bigint not null default 0;
create table document_requirement_private.command_receipts (
  actor_id uuid not null, command_id uuid not null, envelope jsonb not null,
  result jsonb not null, created_at timestamptz not null default now(), primary key(actor_id, command_id)
);
create table document_requirement_private.uploads (
  id uuid primary key, requirement_id uuid not null references public.document_requirement_instances(id) on delete restrict,
  file_path text not null unique, file_name text not null, mime_type text not null, size_bytes bigint not null,
  actor_id uuid not null, replaces_upload_id uuid references document_requirement_private.uploads(id),
  document_id uuid references public.documents(id) on delete restrict, created_at timestamptz not null default now()
);
create index requirement_uploads_document_idx on document_requirement_private.uploads(document_id);
create index requirement_uploads_replaces_idx on document_requirement_private.uploads(replaces_upload_id);
create index requirement_uploads_requirement_idx on document_requirement_private.uploads(requirement_id);
alter table public.document_requirement_instances add column latest_upload_id uuid references document_requirement_private.uploads(id);
create index requirement_latest_upload_idx on public.document_requirement_instances(latest_upload_id);
create table document_requirement_private.context_versions (
  context_type text not null, context_id uuid not null, version bigint not null default 1,
  primary key(context_type,context_id)
);
alter table document_requirement_private.command_receipts enable row level security;
alter table document_requirement_private.uploads enable row level security;
alter table document_requirement_private.context_versions enable row level security;
revoke all on document_requirement_private.command_receipts,document_requirement_private.uploads,document_requirement_private.context_versions from public,anon,authenticated;


-- Serialize a lead/listing add against handover. Guard the exact known body so
-- future divergence stops migration rather than silently omitting this lock.
do $patch$
declare body text; marker text := E'  loop\n    for v_requirement in select * from public.document_requirement_instances';
begin
  select pg_get_functiondef('public.bridge_handoff_manual_document_requirements(uuid)'::regprocedure) into body;
  if position(marker in body)=0 then raise exception 'Unexpected handover function; review source locks.'; end if;
  body:=replace(body,marker,E'  order by context_type, context_id\n  loop\n    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''requirement-source:''||v_source.context_type||'':''||v_source.context_id,0));\n    for v_requirement in select * from public.document_requirement_instances');
  execute body;
end;
$patch$;

create function document_requirement_private.can_manage(p_type text,p_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_role text; v_allowed boolean;
begin
  if auth.uid() is null then return false; end if;
  select lower(role) into v_role from public.profiles where id=auth.uid();
  if coalesce(v_role,'') not in ('agent','agency_admin','developer','internal_admin','admin','attorney','conveyancer','transferring_attorney','bond_attorney','cancellation_attorney') then return false; end if;
  if p_type='transaction' then
    return exists(select 1 from public.transactions where id=p_id) and coalesce(
      public.bridge_has_transaction_permission(p_id,'edit_core_transaction') or
      public.bridge_has_transaction_permission(p_id,'manage_transfer_workflow') or
      public.bridge_has_transaction_permission(p_id,'manage_bond_workflow') or
      public.bridge_can_mutate_attorney_lane(p_id,'transfer_attorney','documents') or
      public.bridge_can_mutate_attorney_lane(p_id,'bond_attorney','documents') or
      public.bridge_can_mutate_attorney_lane(p_id,'cancellation_attorney','documents'),false);
  elsif p_type='private_listing' then
    return exists(select 1 from public.private_listings where id=p_id) and coalesce(public.bridge_can_access_private_listing(p_id),false);
  elsif p_type in ('buyer_lead','seller_lead') then
    select public.bridge_can_access_assignment(l.organisation_id,nullif(to_jsonb(l)->>'assigned_agent_id','')::uuid,null)
      into v_allowed from public.leads l where lead_id=p_id and lead_category=split_part(p_type,'_',1);
    return coalesce(v_allowed,false);
  end if;
  return false;
end;
$$;

-- These triggers cover other existing writers too, so a command cannot silently
-- overwrite a newer review, upload, handover or resolver decision.
create function document_requirement_private.bump_revision()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  new.command_revision := old.command_revision + case when
    (to_jsonb(new)-'command_revision'-'updated_at') is distinct from (to_jsonb(old)-'command_revision'-'updated_at') then 1 else 0 end;
  return new;
end;
$$;
create trigger zz_document_requirement_revision before update on public.document_requirement_instances
for each row execute function document_requirement_private.bump_revision();
create function document_requirement_private.refresh_contexts()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into document_requirement_private.context_versions(context_type,context_id)
    select context_type,context_id from public.document_requirement_context_links where requirement_instance_id=new.id
    union select new.context_type,new.context_id
    on conflict(context_type,context_id) do update set version=document_requirement_private.context_versions.version+1;
  return new;
end;
$$;
create trigger zz_document_requirement_context_refresh after insert or update on public.document_requirement_instances
for each row execute function document_requirement_private.refresh_contexts();

-- Pre-transaction uploads retain their identity and bytes during handover.
create function document_requirement_private.promote_uploads()
returns trigger language plpgsql security definer set search_path='' as $$
declare u document_requirement_private.uploads;
begin
  if new.transaction_id is null or (tg_op='UPDATE' and old.transaction_id is not distinct from new.transaction_id) then return new; end if;
  for u in select * from document_requirement_private.uploads where requirement_id=new.id and document_id is null order by created_at,id for update loop
    insert into public.documents(id,transaction_id,name,file_path,file_bucket,category,document_type,
      canonical_requirement_instance_id,uploaded_by_user_id,visibility_scope,is_client_visible,client_recipient_role,source)
    values(u.id,new.transaction_id,u.file_name,u.file_path,'documents','General',coalesce(new.document_definition_key,'custom_'||new.id),
      new.id,u.actor_id,'client_visible',true,new.requested_from_role,'document_requirement_command');
    update document_requirement_private.uploads set document_id=u.id where id=u.id;
  end loop;
  if new.latest_upload_id is not null then
    update public.document_requirement_instances set satisfied_by_document_id=new.latest_upload_id where id=new.id
      and satisfied_by_document_id is distinct from new.latest_upload_id;
  end if;
  return new;
end;
$$;
create trigger document_requirement_promote_uploads after update of transaction_id on public.document_requirement_instances
for each row execute function document_requirement_private.promote_uploads();

create function document_requirement_private.execute_command(
  p_command_id uuid,p_action text,p_context_type text,p_context_id uuid,
  p_requirement_id uuid,p_expected_revision bigint,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  r public.document_requirement_instances; d public.document_definitions;
  v_envelope jsonb; receipt document_requirement_private.command_receipts; v_result jsonb;
  v_actor uuid:=auth.uid(); v_role text; v_party text; v_kind text; v_subject uuid;
  v_label text; v_reason text; v_upload uuid; v_path text; v_size bigint; v_mime text; v_name text;
  v_current_type text; v_current_id uuid; v_object storage.objects; v_lane text; v_reviewer text;
begin
  if p_command_id is null or p_context_id is null or p_action is null or p_action not in ('add','remove','restore','upload')
    or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid requirement command.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k <> all(case p_action
    when 'add' then array['party','subjectKind','subjectId','definitionKey','label']
    when 'upload' then array['filePath','fileName','mimeType','sizeBytes','replacesUploadId','sha256']
    else array['reason'] end)) then raise exception 'Unsupported command fields.' using errcode='22023'; end if;
  if not document_requirement_private.can_manage(p_context_type,p_context_id) then raise exception 'Not authorised to manage these requirements.' using errcode='42501'; end if;
  select lower(role) into v_role from public.profiles where id=v_actor;
  v_envelope:=jsonb_build_object('action',p_action,'contextType',p_context_type,'contextId',p_context_id,
    'requirementId',p_requirement_id,'expectedRevision',p_expected_revision,'payload',p_payload);
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||p_command_id::text,0));
  -- Same transaction lock as reconciliation/handover, before row locks.
  select context_type,context_id into v_current_type,v_current_id from public.document_requirement_instances where id=p_requirement_id;
  if coalesce(v_current_type,p_context_type)='transaction' then
    perform pg_advisory_xact_lock(hashtextextended(coalesce(v_current_id,p_context_id)::text,0));
    perform pg_advisory_xact_lock(hashtextextended('attorney-documents:'||coalesce(v_current_id,p_context_id)::text,0));
  end if;
  if p_action='add' and p_context_type<>'transaction' then
    perform pg_advisory_xact_lock(hashtextextended('requirement-source:'||p_context_type||':'||p_context_id,0));
  end if;
  if p_action<>'add' then
    select * into r from public.document_requirement_instances where id=p_requirement_id for update;
    if r.id is null or not exists(select 1 from public.document_requirement_context_links where requirement_instance_id=r.id and context_type=p_context_type and context_id=p_context_id)
      or not document_requirement_private.can_manage(r.context_type,r.context_id) then raise exception 'Not authorised to change this requirement.' using errcode='42501'; end if;
    if r.context_type is distinct from v_current_type or r.context_id is distinct from v_current_id then raise exception 'Requirement moved; reload before saving.' using errcode='40001'; end if;
  end if;
  select * into receipt from document_requirement_private.command_receipts where actor_id=v_actor and command_id=p_command_id;
  if found then
    if receipt.envelope<>v_envelope then raise exception 'This command ID was already used for a different change.' using errcode='22023'; end if;
    -- An add receipt may now belong to a transaction reached by handover.
    if not exists(select 1 from public.document_requirement_instances q where q.id=(receipt.result->'requirement'->>'id')::uuid
      and document_requirement_private.can_manage(q.context_type,q.context_id)) then raise exception 'Requirement access has changed.' using errcode='42501'; end if;
    return receipt.result;
  end if;
  if p_action='add' then
    if p_context_type<>'transaction' and exists(select 1 from public.document_requirement_context_links l
      join public.document_requirement_instances q on q.id=l.requirement_instance_id
      where l.context_type=p_context_type and l.context_id=p_context_id and q.transaction_id is not null) then
      raise exception 'This context has moved to a transaction. Add the requirement there.' using errcode='40001';
    end if;
    if p_requirement_id is not null or p_expected_revision is not null then raise exception 'Add does not accept an existing requirement.' using errcode='22023'; end if;
    v_party:=p_payload->>'party'; v_kind:=coalesce(p_payload->>'subjectKind','party'); v_subject:=nullif(p_payload->>'subjectId','')::uuid;
    if v_party is null or v_party not in ('buyer','seller') or
      (p_context_type in ('buyer_lead','seller_lead') and v_party<>split_part(p_context_type,'_',1)) or
      (p_context_type='private_listing' and v_party<>'seller') then raise exception 'Choose the party belonging to this context.' using errcode='22023'; end if;
    if v_kind='party' then
      if v_subject is not null then raise exception 'Party scope has no subject ID.' using errcode='22023'; end if;
    elsif v_kind in ('person','entity','property') and v_subject is not null then
      -- Reuse an authoritative scoped subject, never a caller-created identity.
      if not exists(select 1 from public.document_requirement_instances q
          join public.document_requirement_context_links l on l.requirement_instance_id=q.id
          where l.context_type=p_context_type and l.context_id=p_context_id and q.requested_from_role=v_party
          and ((q.subject_kind=v_kind and q.subject_id=v_subject) or (v_kind='person' and q.requested_from_contact_id=v_subject)))
        and not (v_kind='property' and p_context_type='private_listing' and v_subject=p_context_id)
        and not (v_kind='person' and p_context_type='transaction' and exists(
          select 1 from public.onboarding_form_data f,
            lateral jsonb_array_elements(coalesce(f.form_data->'__bridge_transaction_parties'->v_party->'people','[]'::jsonb)) person
          where f.transaction_id=p_context_id and person->>'id'=v_subject::text)) then
        raise exception 'The subject does not belong to this party and context.' using errcode='22023';
      end if;
    else raise exception 'Invalid subject scope.' using errcode='22023'; end if;
    if nullif(p_payload->>'definitionKey','') is not null then
      select * into d from public.document_definitions where key=p_payload->>'definitionKey' and is_active;
      if d.key is null then raise exception 'Unknown active document type.' using errcode='22023'; end if;
      if not (v_party=any(d.default_upload_roles)) then raise exception 'This document type is not requested from that party.' using errcode='22023'; end if;
      if nullif(btrim(p_payload->>'label'),'') is not null then raise exception 'Standard document types retain their catalogue name.' using errcode='22023'; end if;
      select reviewer_role into v_reviewer from public.document_requirement_rules
        where document_definition_key=d.key and is_active and (requested_from_role=v_party or requested_from_role is null)
        and reviewer_role is not null
        order by (reviewer_role in ('transferring_attorney','transfer_attorney','bond_attorney','cancellation_attorney')) desc, priority,id limit 1;
    else
      v_label:=btrim(p_payload->>'label');
      if v_label is null or length(v_label) not between 1 and 200 then raise exception 'Enter a document name of 1 to 200 characters.' using errcode='22023'; end if;
    end if;
    insert into public.document_requirement_instances(context_type,context_id,transaction_id,listing_id,document_definition_key,
      custom_label,requirement_origin,subject_kind,subject_id,requested_from_contact_id,requested_from_role,pack_key,
      requirement_level,status,visible_to_roles,uploadable_by_roles,reviewer_role,source_system)
    values(p_context_type,p_context_id,case when p_context_type='transaction' then p_context_id end,
      case when p_context_type='private_listing' then p_context_id end,d.key,v_label,'manual',v_kind,v_subject,
      case when v_kind='person' then v_subject end,v_party,coalesce(d.pack_key,v_party||'_identity_fica'),
      coalesce(d.default_requirement_level,'required'),'pending',coalesce(d.default_visibility,array[v_party,'agent']),coalesce(d.default_upload_roles,array[v_party,'agent']),coalesce(v_reviewer,'agent'),'manual') returning * into r;
  else
    if p_expected_revision is null or p_expected_revision<>r.command_revision then raise exception 'This requirement changed. Reload before saving.' using errcode='40001'; end if;
    if p_action in ('remove','restore') then
      v_reason:=btrim(p_payload->>'reason');
      if v_reason is null or length(v_reason) not between 1 and 2000 then raise exception 'A reason of 1 to 2000 characters is required.' using errcode='22023'; end if;
      if p_action='remove' then
        if r.applicability_override='removed' then raise exception 'Requirement is already removed.' using errcode='22023'; end if;
        -- Match the established attorney waiver boundary; support staff cannot bypass it through removal.
        if v_role in ('attorney','conveyancer','transferring_attorney','bond_attorney','cancellation_attorney')
          or coalesce(r.reviewer_role,'') in ('transferring_attorney','transfer_attorney','bond_attorney','cancellation_attorney') then
          v_lane:=case when r.reviewer_role='bond_attorney' then 'bond_attorney' when r.reviewer_role='cancellation_attorney' then 'cancellation_attorney' else 'transfer_attorney' end;
          if r.transaction_id is null or not coalesce(public.bridge_can_mutate_attorney_lane(r.transaction_id,v_lane,'documents'),false)
            or not exists(select 1 from public.transaction_attorney_assignments a join public.attorney_firm_members m
              on m.firm_id=coalesce(a.attorney_firm_id,a.firm_id) and m.user_id=v_actor and m.status='active'
              where a.transaction_id=r.transaction_id and coalesce(a.assignment_status,a.status)='active'
              and coalesce(m.professional_role,m.role) in ('firm_admin','director_partner','attorney_conveyancer','transfer_attorney','bond_attorney','cancellation_attorney')) then
            raise exception 'Only an authorised principal or conveyancer may remove this document.' using errcode='42501';
          end if;
        end if;
        update public.document_requirement_instances set applicability_override='removed',override_reason=v_reason,override_actor_id=v_actor where id=r.id returning * into r;
        update public.document_requests set status='cancelled',updated_at=now() where canonical_requirement_instance_id=r.id and status not in ('completed','cancelled');
        -- Keep the grouped reminder/history, but cancel its stale payload. The
        -- scheduler can rebuild a group containing only still-active requirements.
        update public.document_requirement_reminders set status='cancelled',next_reminder_at=null,suppressed_reason='Requirement removed: '||v_reason
          where status in ('pending','scheduled','paused','failed') and (requirement_instance_id=r.id or id in
            (select reminder_id from public.document_requirement_reminder_items where requirement_instance_id=r.id));
      else
        if r.applicability_override is distinct from 'removed' then raise exception 'Requirement is not removed.' using errcode='22023'; end if;
        update public.document_requirement_instances set applicability_override=null where id=r.id returning * into r;
        -- Restore the checklist and evidence only. A cancelled solicitation or
        -- reminder must be deliberately re-requested, never silently resent.
      end if;
    elsif p_action='upload' then
      if r.applicability_override='removed' or r.status='not_applicable' then raise exception 'Restore this requirement before uploading.' using errcode='22023'; end if;
      v_upload:=p_command_id; v_path:=p_payload->>'filePath'; v_name:=p_payload->>'fileName'; v_mime:=p_payload->>'mimeType'; v_size:=(p_payload->>'sizeBytes')::bigint;
      if v_name is null or v_name !~ '^[A-Za-z0-9_.-]{1,200}$' or
        v_path is distinct from 'document-requirements/'||r.id||'/'||v_actor||'/'||p_command_id||'/'||v_name or
        coalesce(p_payload->>'sha256','') !~ '^[a-f0-9]{64}$' or
        v_size is null or v_size not between 1 and 36700160 or
        v_mime is null or v_mime not in ('application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
        raise exception 'Invalid private upload metadata.' using errcode='22023'; end if;
      if not ((v_name ~* '\.pdf$' and v_mime='application/pdf') or
        (v_name ~* '\.jpe?g$' and v_mime='image/jpeg') or (v_name ~* '\.png$' and v_mime='image/png') or
        (v_name ~* '\.doc$' and v_mime='application/msword') or
        (v_name ~* '\.docx$' and v_mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document')) then
        raise exception 'The file extension does not match its type.' using errcode='22023'; end if;
      if nullif(p_payload->>'replacesUploadId','')::uuid is distinct from r.latest_upload_id then raise exception 'The current upload changed; reload before replacing it.' using errcode='40001'; end if;
      select * into v_object from storage.objects where bucket_id='documents' and name=v_path for update;
      if v_object.id is null or v_object.owner_id is distinct from v_actor::text
        or (v_object.metadata->>'size')::bigint is distinct from v_size or v_object.metadata->>'mimetype' is distinct from v_mime
        or v_object.user_metadata->>'sha256' is distinct from p_payload->>'sha256'
        or not exists(select 1 from storage.buckets where id='documents' and public=false) then
        raise exception 'The private upload could not be verified.' using errcode='42501'; end if;
      insert into document_requirement_private.uploads(id,requirement_id,file_path,file_name,mime_type,size_bytes,actor_id,replaces_upload_id)
        values(v_upload,r.id,v_path,v_name,v_mime,v_size,v_actor,r.latest_upload_id);
      if r.transaction_id is not null then
        insert into public.documents(id,transaction_id,name,file_path,file_bucket,category,document_type,canonical_requirement_instance_id,
          uploaded_by_user_id,visibility_scope,is_client_visible,client_recipient_role,source)
        values(v_upload,r.transaction_id,v_name,v_path,'documents','General',coalesce(r.document_definition_key,'custom_'||r.id),r.id,
          v_actor,'client_visible',true,r.requested_from_role,'document_requirement_command');
        update document_requirement_private.uploads set document_id=v_upload where id=v_upload;
      end if;
      update public.document_requirement_instances set latest_upload_id=v_upload,
        satisfied_by_document_id=case when transaction_id is not null then v_upload else satisfied_by_document_id end,
        status='under_review',rejection_reason=null,waiver_reason=null where id=r.id returning * into r;
      update public.document_requests set requested_document_id=v_upload,status='uploaded',updated_at=now()
        where canonical_requirement_instance_id=r.id and status not in ('completed','cancelled') and r.transaction_id is not null;
    end if;
  end if;
  -- Request synchronization triggers may have updated the requirement again.
  select * into r from public.document_requirement_instances where id=r.id;
  insert into public.document_requirement_events(requirement_instance_id,event_type,actor_user_id,actor_role,message,metadata_json)
    values(r.id,case p_action when 'add' then 'created' when 'upload' then 'uploaded' else 'status_changed' end,
      v_actor,v_role,'Document requirement command: '||p_action,jsonb_build_object('commandId',p_command_id,'action',p_action,'reason',v_reason,'uploadId',v_upload));
  v_result:=jsonb_build_object('saved',true,'commandId',p_command_id,'requirement',to_jsonb(r),'uploadId',v_upload,
    'refreshContexts',(select coalesce(jsonb_agg(jsonb_build_object('contextType',l.context_type,'contextId',l.context_id,'version',v.version)),'[]'::jsonb)
      from public.document_requirement_context_links l join document_requirement_private.context_versions v using(context_type,context_id) where l.requirement_instance_id=r.id));
  insert into document_requirement_private.command_receipts(actor_id,command_id,envelope,result) values(v_actor,p_command_id,v_envelope,v_result);
  return v_result;
end;
$$;

create function public.bridge_document_requirement_command(p_command_id uuid,p_action text,p_context_type text,p_context_id uuid,
  p_requirement_id uuid default null,p_expected_revision bigint default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select document_requirement_private.execute_command(p_command_id,p_action,p_context_type,p_context_id,p_requirement_id,p_expected_revision,p_payload);
$$;


create function document_requirement_private.command_receipt(p_command_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c document_requirement_private.command_receipts; r public.document_requirement_instances;
begin
  select * into c from document_requirement_private.command_receipts where actor_id=auth.uid() and command_id=p_command_id;
  if not found then return null; end if;
  select * into r from public.document_requirement_instances where id=(c.result->'requirement'->>'id')::uuid;
  if not document_requirement_private.can_manage(c.envelope->>'contextType',(c.envelope->>'contextId')::uuid)
    or not document_requirement_private.can_manage(r.context_type,r.context_id) then raise exception 'Requirement access has changed.' using errcode='42501'; end if;
  return jsonb_build_object('envelope',c.envelope,'result',c.result);
end;
$$;
create function public.bridge_document_requirement_command_receipt(p_command_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select document_requirement_private.command_receipt(p_command_id);
$$;
revoke all on function public.bridge_document_requirement_command_receipt(uuid) from public,anon,authenticated;
grant execute on function public.bridge_document_requirement_command_receipt(uuid) to authenticated;

-- A restrictive boundary makes this namespace immutable once metadata is saved,
-- even if an older permissive storage policy grants owner update/delete access.
create function document_requirement_private.object_access(p_bucket text,p_name text,p_write boolean)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare r public.document_requirement_instances; u document_requirement_private.uploads; d public.documents;
begin
  if split_part(p_name,'/',1)<>'document-requirements' then return true; end if;
  if p_bucket<>'documents' then return false; end if;
  select * into r from public.document_requirement_instances where id=split_part(p_name,'/',2)::uuid;
  if r.id is null then return false; end if;
  select * into u from document_requirement_private.uploads where file_path=p_name;
  if u.id is not null then
    if p_write then return false; end if;
    if u.document_id is not null then
      select * into d from public.documents where id=u.document_id;
      return document_security.can_read(d);
    end if;
    return document_requirement_private.can_manage(r.context_type,r.context_id);
  end if;
  return auth.uid() is not null and split_part(p_name,'/',3)=auth.uid()::text and split_part(p_name,'/',4) ~ '^[0-9a-f-]{36}$'
    and split_part(p_name,'/',5) ~ '^[A-Za-z0-9_.-]{1,200}$' and split_part(p_name,'/',6)=''
    and r.applicability_override is null and r.status<>'not_applicable'
    and document_requirement_private.can_manage(r.context_type,r.context_id);
exception when invalid_text_representation then return false;
end;
$$;
create policy requirement_upload_read_boundary on storage.objects as restrictive for select to anon,authenticated
  using(document_requirement_private.object_access(bucket_id,name,false));
create policy requirement_upload_insert_boundary on storage.objects as restrictive for insert to anon,authenticated
  with check(document_requirement_private.object_access(bucket_id,name,true));
create policy requirement_upload_update_boundary on storage.objects as restrictive for update to anon,authenticated
  using(document_requirement_private.object_access(bucket_id,name,true)) with check(document_requirement_private.object_access(bucket_id,name,true));
create policy requirement_upload_delete_boundary on storage.objects as restrictive for delete to anon,authenticated
  using(document_requirement_private.object_access(bucket_id,name,true));
create policy requirement_upload_insert on storage.objects for insert to authenticated
  with check(bucket_id='documents' and split_part(name,'/',1)='document-requirements' and document_requirement_private.object_access(bucket_id,name,true));
create policy requirement_upload_read on storage.objects for select to authenticated
  using(bucket_id='documents' and split_part(name,'/',1)='document-requirements' and document_requirement_private.object_access(bucket_id,name,false));

revoke all on all functions in schema document_requirement_private from public,anon,authenticated;
-- Restore stage 1 reader grant after locking down the new helpers.
grant execute on function document_requirement_private.read_document_requirements_for_reconciliation(text,uuid) to authenticated,service_role;
grant execute on function document_requirement_private.command_receipt(uuid) to authenticated;
grant execute on function document_requirement_private.execute_command(uuid,text,text,uuid,uuid,bigint,jsonb) to authenticated;
grant usage on schema document_requirement_private to anon;
grant execute on function document_requirement_private.object_access(text,text,boolean) to anon,authenticated;
revoke all on function public.bridge_document_requirement_command(uuid,text,text,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.bridge_document_requirement_command(uuid,text,text,uuid,uuid,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
