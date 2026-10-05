begin;

-- Keep the owning firm on new records; do not rewrite historical files or notes.
alter table public.documents add column internal_firm_id uuid references public.attorney_firms(id);
alter table public.transaction_attorney_lane_updates add column internal_firm_id uuid references public.attorney_firms(id);
alter table public.transaction_attorney_lane_history add column internal_firm_id uuid references public.attorney_firms(id);
create index transaction_sync_private_event_source_idx on public.transaction_sync_command_receipts(canonical_event_id)
  where canonical_event_id is not null;

create or replace function document_security.lane_role(p_lane text)
returns text language sql immutable set search_path = '' as $$
  select case lower(trim(coalesce(p_lane,'')))
    when 'transfer' then 'transfer_attorney' when 'attorney' then 'transfer_attorney'
    when 'transfer_attorney' then 'transfer_attorney'
    when 'bond' then 'bond_attorney' when 'bond_registration' then 'bond_attorney'
    when 'bond_attorney' then 'bond_attorney'
    when 'cancellation' then 'cancellation_attorney' when 'seller_bond_cancellation' then 'cancellation_attorney'
    when 'cancellation_attorney' then 'cancellation_attorney' end;
$$;

-- Resolve a legacy author only when there is one unambiguous owning firm.
-- Delegated authors belong to the responsible firm for the delegated work.
create or replace function document_security.internal_firm(p_transaction uuid,p_lane text,p_author uuid,p_current boolean default false)
returns uuid language sql stable security definer set search_path = '' as $$
  select case when count(distinct firm_id)=1 then (array_agg(distinct firm_id))[1] end
  from (
    select coalesce(a.attorney_firm_id,a.firm_id) firm_id
    from public.transaction_attorney_assignments a
    join public.attorney_firm_members m on m.firm_id=coalesce(a.attorney_firm_id,a.firm_id) and m.user_id=p_author
    where a.transaction_id=p_transaction
      and (not p_current or (m.status='active' and coalesce(a.assignment_status,a.status) in ('pending','active','paused') and coalesce(a.status,'active')<>'removed'))
      and (a.attorney_role=document_security.lane_role(p_lane)
        or (document_security.lane_role(p_lane)='transfer_attorney' and coalesce(a.assignment_type,a.matter_type) in ('transfer','transfer_and_bond'))
        or (document_security.lane_role(p_lane)='bond_attorney' and coalesce(a.assignment_type,a.matter_type) in ('bond','transfer_and_bond'))
        or (document_security.lane_role(p_lane)='cancellation_attorney' and coalesce(a.assignment_type,a.matter_type) in ('cancellation','bond_cancellation')))
    union
    select d.responsible_firm_id from public.attorney_lane_delegations d
    where d.transaction_id=p_transaction and d.attorney_role=document_security.lane_role(p_lane)
      and d.delegate_user_id=p_author
      and (not p_current or (d.status='active' and d.starts_at<=now() and d.expires_at>now()))
  ) owners where firm_id is not null;
$$;

create or replace function document_security.can_read_internal_lane(
  p_transaction uuid,p_lane text,p_author uuid,p_firm uuid,p_capability text
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role text := document_security.lane_role(p_lane);
  v_firm uuid := coalesce(p_firm,document_security.internal_firm(p_transaction,p_lane,p_author));
begin
  if v_actor is null or not coalesce(public.bridge_can_access_transaction_spine(p_transaction),false) then return false; end if;
  -- Unknown legacy ownership remains author-only, never matter-wide.
  if v_firm is null then return v_actor=p_author; end if;
  if v_role is null then return false; end if;
  if public.bridge_attorney_matter_team_access(p_transaction,v_firm,'view') and exists (
    select 1 from public.transaction_attorney_assignments a
    where a.transaction_id=p_transaction and coalesce(a.attorney_firm_id,a.firm_id)=v_firm
      and coalesce(a.assignment_status,a.status) in ('pending','active','paused')
      and coalesce(a.status,'active')<>'removed'
      and (a.attorney_role=v_role
        or (v_role='transfer_attorney' and coalesce(a.assignment_type,a.matter_type) in ('transfer','transfer_and_bond'))
        or (v_role='bond_attorney' and coalesce(a.assignment_type,a.matter_type) in ('bond','transfer_and_bond'))
        or (v_role='cancellation_attorney' and coalesce(a.assignment_type,a.matter_type) in ('cancellation','bond_cancellation')))
  ) then return true; end if;
  return exists (
    select 1 from public.attorney_lane_delegations d
    join public.transaction_attorney_assignments a on a.transaction_id=d.transaction_id
      and a.attorney_role=d.attorney_role and coalesce(a.attorney_firm_id,a.firm_id)=d.responsible_firm_id
    where d.transaction_id=p_transaction and d.attorney_role=v_role and d.responsible_firm_id=v_firm
      and d.delegate_user_id=v_actor and d.status='active' and d.starts_at<=now() and d.expires_at>now()
      and p_capability=any(d.capabilities)
      and coalesce(a.assignment_status,a.status)='active' and coalesce(a.status,'active')<>'removed'
      and case p_capability when 'documents' then coalesce(a.can_manage_documents,true)
        when 'internal_notes' then coalesce(a.can_add_internal_notes,true) else false end
  );
end;
$$;

create or replace function document_security.stamp_internal_firm()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_author uuid; v_lane text;
begin
  if tg_op='UPDATE' then
    if new.internal_firm_id is distinct from old.internal_firm_id then
      raise exception 'The owning firm of a private record cannot be changed.' using errcode='42501';
    end if;
    return new;
  end if;
  if tg_table_name='documents' then v_author:=new.uploaded_by_user_id; v_lane:=coalesce(new.lane_key,new.attorney_role);
  elsif tg_table_name='transaction_attorney_lane_updates' then v_author:=new.created_by; v_lane:=coalesce(new.lane_key,new.attorney_role);
  else v_author:=new.changed_by; v_lane:=coalesce(new.lane_key,new.attorney_role); end if;
  -- Ignore caller-supplied ownership, including for subsequently shared records.
  new.internal_firm_id:=document_security.internal_firm(new.transaction_id,v_lane,v_author,true);
  return new;
end;
$$;
create trigger documents_internal_firm before insert or update on public.documents
  for each row execute function document_security.stamp_internal_firm();
create trigger attorney_updates_internal_firm before insert or update on public.transaction_attorney_lane_updates
  for each row execute function document_security.stamp_internal_firm();
create trigger attorney_history_internal_firm before insert or update on public.transaction_attorney_lane_history
  for each row execute function document_security.stamp_internal_firm();

-- Retain the signed bond original's dedicated ACL and all shared/client scopes.
create or replace function document_security.can_read(d public.documents)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  scope text := lower(coalesce(d.visibility_scope,'internal'));
  recipient text := lower(coalesce(d.client_recipient_role,''));
  professional boolean := auth.uid() is not null and journey_private.can_read_professional_journey(d.transaction_id);
begin
  if d.file_bucket='bond-signed-applications' then return public.bridge_bond_wet_ink_storage_access(d.file_path,false); end if;
  if d.transaction_id is null then return false; end if;
  if scope in ('internal','internal_only','admin_only') then
    return professional and document_security.can_read_internal_lane(d.transaction_id,
      coalesce(d.lane_key,d.attorney_role),d.uploaded_by_user_id,d.internal_firm_id,'documents');
  end if;
  if scope not in ('shared','client','client_visible','professional_shared','shared_role_players') then return false; end if;
  if professional then return true; end if;
  if public.bridge_has_external_workspace_transaction_access(d.transaction_id)
    and lower(coalesce(public.bridge_external_workspace_role(),'')) in ('attorney','tuckers','bond_originator','agent','developer') then return true; end if;
  if d.source='developer_document_portal' and exists (
    select 1 from public.bridge_developer_document_portal_active_link() link
    where link.transaction_id=d.transaction_id and link.id is not null
  ) then return true; end if;
  if scope in ('professional_shared','shared_role_players') then return false; end if;
  if recipient not in ('','buyer','seller','both','all','client','shared') then return false; end if;
  if recipient<>'seller' and (public.bridge_has_client_portal_token_transaction_access(d.transaction_id)
    or public.bridge_has_onboarding_token_transaction_access(d.transaction_id)) then return true; end if;
  if recipient<>'buyer' and exists (select 1 from public.transactions t where t.id=d.transaction_id
    and t.listing_id=public.bridge_storage_seller_portal_listing_id()) then return true; end if;
  return false;
end;
$$;

-- Before metadata commits, a private transaction upload is readable only by
-- its uploader. Preserve upload-before-metadata and other storage surfaces.
create or replace function document_security.object_allowed(p_bucket text,p_name text,p_write boolean default false)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare d public.documents; linked boolean := false; root text := split_part(p_name,'/',1);
begin
  for d in select * from public.documents where file_path=p_name and coalesce(file_bucket,'documents')=p_bucket and transaction_id is not null loop
    linked:=true;
    if not coalesce(document_security.can_read(d),false) then return false; end if;
    if p_write and auth.uid() is not null and not document_security.can_upload(d.transaction_id) then return false; end if;
  end loop;
  if linked then return true; end if;
  if p_bucket='documents' and root ~ '^transaction-[0-9a-fA-F-]{36}$' then
    if p_write then return document_security.can_upload(substring(root from 13)::uuid); end if;
    return auth.uid() is not null and public.bridge_can_access_transaction_spine(substring(root from 13)::uuid)
      and exists (select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_name and o.owner_id=auth.uid()::text);
  end if;
  return true;
exception when invalid_text_representation then return false;
end;
$$;

-- Restrictive policies also constrain older permissive reads and owner/admin reads.
create policy attorney_updates_internal_boundary on public.transaction_attorney_lane_updates
  as restrictive for select to anon,authenticated using (
    visibility<>'internal' or document_security.can_read_internal_lane(transaction_id,lane_key,created_by,internal_firm_id,'internal_notes'));
create policy attorney_history_internal_boundary on public.transaction_attorney_lane_history
  as restrictive for select to anon,authenticated using (
    visibility<>'internal' or document_security.can_read_internal_lane(transaction_id,lane_key,changed_by,internal_firm_id,'internal_notes'));
-- Firm-team readers and delegates can read permitted private notes even when
-- older permissive policies mention only the individually appointed attorney.
create policy attorney_updates_private_team_read on public.transaction_attorney_lane_updates
  for select to authenticated using (visibility='internal' and document_security.can_read_internal_lane(transaction_id,lane_key,created_by,internal_firm_id,'internal_notes'));
create policy attorney_history_private_team_read on public.transaction_attorney_lane_history
  for select to authenticated using (visibility='internal' and document_security.can_read_internal_lane(transaction_id,lane_key,changed_by,internal_firm_id,'internal_notes'));

-- Resolve projected activity back to the protected source record. The same
-- predicate protects receipts and raw events so a second reader cannot bypass it.
create or replace function document_security.can_read_internal_event(
  p_transaction uuid,p_lane text,p_actor uuid,p_source_table text,p_source_id text
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_document public.documents; v_update public.transaction_attorney_lane_updates; v_history public.transaction_attorney_lane_history;
begin
  if auth.uid() is null or not coalesce(public.bridge_can_access_transaction_spine(p_transaction),false) then return false; end if;
  if p_source_table in ('documents','transaction_attorney_lane_updates','transaction_attorney_lane_history')
    and coalesce(p_source_id,'') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false; end if;
  if p_source_table='documents' then
    select * into v_document from public.documents where id=p_source_id::uuid and transaction_id=p_transaction;
    return v_document.id is not null and document_security.can_read(v_document);
  elsif p_source_table='transaction_attorney_lane_updates' then
    select * into v_update from public.transaction_attorney_lane_updates where id=p_source_id::uuid and transaction_id=p_transaction;
    return v_update.id is not null and document_security.can_read_internal_lane(p_transaction,v_update.lane_key,v_update.created_by,v_update.internal_firm_id,'internal_notes');
  elsif p_source_table='transaction_attorney_lane_history' then
    select * into v_history from public.transaction_attorney_lane_history where id=p_source_id::uuid and transaction_id=p_transaction;
    return v_history.id is not null and document_security.can_read_internal_lane(p_transaction,v_history.lane_key,v_history.changed_by,v_history.internal_firm_id,'internal_notes');
  end if;
  -- Other existing internal actions retain their own policy. An unlinked legal
  -- note is author-only rather than inferring access from the generic attorney role.
  if document_security.lane_role(p_lane) is not null then return auth.uid()=p_actor; end if;
  return true;
end;
$$;

create or replace function document_security.can_read_private_projection(p_receipt uuid,p_transaction uuid,p_lane text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare r public.transaction_sync_command_receipts;
begin
  select * into r from public.transaction_sync_command_receipts where id=p_receipt and transaction_id=p_transaction;
  if r.id is null then return false; end if;
  return document_security.can_read_internal_event(p_transaction,p_lane,r.actor_id,r.source_table,r.source_record_id);
end;
$$;
create or replace function document_security.can_read_private_event(e public.transaction_events)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare r public.transaction_sync_command_receipts; v_source text; v_id text;
begin
  select * into r from public.transaction_sync_command_receipts where canonical_event_id=e.id and transaction_id=e.transaction_id limit 1;
  if r.id is not null then return document_security.can_read_internal_event(e.transaction_id,
    coalesce(e.event_data->>'affectedLane',e.event_data->>'laneKey',r.actor_role),r.actor_id,r.source_table,r.source_record_id); end if;
  v_source:=e.event_data->>'sourceTable'; v_id:=e.event_data->>'sourceRecordId';
  if e.event_data ? 'documentId' then v_source:='documents'; v_id:=e.event_data->>'documentId'; end if;
  if e.event_data ? 'updateId' then v_source:='transaction_attorney_lane_updates'; v_id:=e.event_data->>'updateId'; end if;
  return document_security.can_read_internal_event(e.transaction_id,
    coalesce(e.event_data->>'laneKey',e.event_data->>'attorneyRole',e.created_by_role),e.created_by,v_source,v_id);
end;
$$;
create policy activity_private_source_boundary on public.transaction_activity_projections
  as restrictive for select to anon,authenticated using (visibility<>'internal'
    or document_security.can_read_private_projection(command_receipt_id,transaction_id,lane_key));
create policy receipts_private_source_boundary on public.transaction_sync_command_receipts
  as restrictive for select to anon,authenticated using (visibility<>'internal'
    or document_security.can_read_private_projection(id,transaction_id,actor_role));
create policy events_private_source_boundary on public.transaction_events
  as restrictive for select to anon,authenticated using (visibility_scope not in ('internal','internal_only','admin_only')
    or document_security.can_read_private_event(transaction_events));

-- Keep private helper schemas outside the Data API. Only policy predicates need
-- browser execution; ownership resolution and triggers cannot be called directly.
revoke all on function document_security.lane_role(text) from public,anon,authenticated;
revoke all on function document_security.internal_firm(uuid,text,uuid,boolean) from public,anon,authenticated;
revoke all on function document_security.stamp_internal_firm() from public,anon,authenticated;
revoke all on function document_security.can_read_internal_event(uuid,text,uuid,text,text) from public,anon,authenticated;
revoke all on function document_security.can_read_internal_lane(uuid,text,uuid,uuid,text) from public,anon,authenticated;
revoke all on function document_security.can_read_private_projection(uuid,uuid,text) from public,anon,authenticated;
revoke all on function document_security.can_read_private_event(public.transaction_events) from public,anon,authenticated;
grant execute on function document_security.can_read_internal_lane(uuid,text,uuid,uuid,text),
  document_security.can_read_private_projection(uuid,uuid,text),document_security.can_read_private_event(public.transaction_events) to anon,authenticated;

-- Narrow future private-note audiences at the existing atomic entry point.
-- Preserve their authorization, receipts and transaction semantics verbatim.
do $private_audiences$
declare v_definition text; v_needle text;
begin
  v_definition:=pg_get_functiondef('public.bridge_add_attorney_comment_and_sync_phase3(uuid,text,text,text)'::regprocedure);
  v_needle:=$needle$case v_lane.process_type
      when 'cancellation' then '["seller","agent","bond_originator","transfer_attorney","bond_attorney","cancellation_attorney"]'::jsonb
      else '["buyer","seller","agent","bond_originator","transfer_attorney","bond_attorney","cancellation_attorney"]'::jsonb
    end$needle$;
  if position(v_needle in v_definition)=0 then raise exception 'Review the changed atomic comment audience before release'; end if;
  execute replace(v_definition,v_needle,'jsonb_build_array(v_role)');
end;
$private_audiences$;

-- Document save functions are definers: retries and predecessors must respect
-- the same read boundary rather than relying on the caller's unrelated lane.
do $private_document_actions$
declare v_definition text; v_signature text; v_row text; v_needle text;
begin
  foreach v_signature in array array['public.bridge_save_attorney_document(jsonb,uuid)',
    'public.bridge_save_attorney_document_version(jsonb,uuid)'] loop
    v_row:=case when v_signature like '%document_version%' then 'v_existing' else 'v_document' end;
    v_definition:=pg_get_functiondef(v_signature::regprocedure);
    v_needle:='return jsonb_build_object(''document'', to_jsonb(' || v_row || '), ''deduplicated'', true);';
    if position(v_needle in v_definition)=0 then raise exception 'Review the changed document retry action before release'; end if;
    execute replace(v_definition,v_needle,
      'if not coalesce(document_security.can_read(' || v_row || '),false) then raise exception ''This private document is no longer available to your team.'' using errcode=''42501''; end if; ' || v_needle);
  end loop;
  v_definition:=pg_get_functiondef('public.bridge_save_attorney_document_version(jsonb,uuid)'::regprocedure);
  v_needle:='if not found or v_previous.transaction_id is distinct from v_transaction';
  if position(v_needle in v_definition)=0 then raise exception 'Review the changed document predecessor action before release'; end if;
  execute replace(v_definition,v_needle,v_needle || ' or not coalesce(document_security.can_read(v_previous),false)');
end;
$private_document_actions$;

-- Private FICA reviews have no client copy in the canonical catalogue.
update journey_private.task_catalog set definition=pg_catalog.jsonb_set(definition,'{client}','null'::jsonb)
where lane_key='transfer' and step_key in ('buyer_fica_review','seller_fica_review')
  and definition->>'clientVisibleAllowed'='false';

notify pgrst, 'reload schema';
commit;
