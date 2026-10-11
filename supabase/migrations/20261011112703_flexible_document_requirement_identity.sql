begin;

-- Stage 1 only: persistence and identity. Agent commands and portal projection
-- are added separately; this migration grants no new browser write access.
alter table public.document_requirement_instances
  alter column document_definition_key drop not null,
  add column requirement_origin text not null default 'matrix',
  add column custom_label text,
  add column subject_kind text not null default 'party',
  add column subject_id uuid,
  add column applicability_override text,
  add column override_reason text,
  add column override_actor_id uuid,
  add column override_at timestamptz,
  add column status_before_removal text,
  add constraint document_requirement_origin_check check (requirement_origin in ('matrix', 'manual')),
  add constraint document_requirement_custom_label_check check (
    (document_definition_key is not null and custom_label is null) or
    (document_definition_key is null and requirement_origin = 'manual'
      and custom_label is not null and length(btrim(custom_label)) between 1 and 200)
  ),
  add constraint document_requirement_subject_check check (
    (subject_kind = 'party' and subject_id is null) or
    (subject_kind in ('person', 'entity', 'property') and subject_id is not null)
  ),
  add constraint document_requirement_override_check check (
    applicability_override is null or
    (applicability_override = 'removed' and nullif(btrim(override_reason), '') is not null
      and override_actor_id is not null and override_at is not null and status = 'not_applicable')
  );

comment on column public.document_requirement_instances.custom_label is
  'A transaction/lead/listing-local custom type. Its stable type key is custom_<instance id>; no global definition is created.';
comment on column public.document_requirement_instances.applicability_override is
  'An explicit removal independent of rule applicability and evidence. Recalculation must preserve it.';

-- A removal reserves the standard identity too: another insert cannot evade
-- the saved decision by creating a second active requirement for that person.
drop index public.document_requirement_instances_active_unique_idx;
create unique index document_requirement_instances_active_unique_idx
  on public.document_requirement_instances(context_type, context_id, document_definition_key,
    coalesce(requested_from_contact_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status <> 'not_applicable' or applicability_override = 'removed';

-- Earlier contexts remain discoverable after handover without cloning the
-- requirement, its request links, reviews or file references.
create table public.document_requirement_context_links (
  requirement_instance_id uuid not null references public.document_requirement_instances(id) on delete restrict,
  context_type text not null,
  context_id uuid not null,
  linked_at timestamptz not null default now(),
  primary key (requirement_instance_id, context_type, context_id)
);
create index document_requirement_context_lookup_idx
  on public.document_requirement_context_links(context_type, context_id);
alter table public.document_requirement_context_links enable row level security;
revoke all on public.document_requirement_context_links from public, anon, authenticated;
grant all on public.document_requirement_context_links to service_role;
create policy document_requirement_context_service_access
  on public.document_requirement_context_links for all to service_role using (true) with check (true);

insert into public.document_requirement_context_links(requirement_instance_id, context_type, context_id)
  select id, context_type, context_id from public.document_requirement_instances;

-- This invoker trigger is reached through the existing authorised database
-- writers. It also protects against older resolver code trying to reactivate
-- an explicitly removed requirement.
create function public.bridge_preserve_document_requirement_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.document_definition_key is distinct from old.document_definition_key
       or new.requirement_origin is distinct from old.requirement_origin
       or (old.requirement_origin = 'manual' and (
         new.subject_kind is distinct from old.subject_kind or new.subject_id is distinct from old.subject_id
         or new.requested_from_contact_id is distinct from old.requested_from_contact_id
         or new.requested_from_role is distinct from old.requested_from_role)) then
      raise exception 'Requirement identity and origin are immutable.' using errcode = '22023';
    end if;
    if old.requirement_origin = 'manual' and new.source_system is distinct from old.source_system and
       new.source_system in ('canonical_document_resolver', 'transaction_canonical_document_requirement_engine') then
      new.pack_key := old.pack_key;
      new.requirement_level := old.requirement_level;
      new.status := old.status;
      new.stage_gates := old.stage_gates;
      new.requested_from_role := old.requested_from_role;
      new.requested_from_contact_id := old.requested_from_contact_id;
      new.visible_to_roles := old.visible_to_roles;
      new.uploadable_by_roles := old.uploadable_by_roles;
      new.reviewer_role := old.reviewer_role;
      new.rule_id := old.rule_id;
      new.source_system := old.source_system;
      new.resolver_version := old.resolver_version;
    end if;
    if new.applicability_override = 'removed' and old.applicability_override is distinct from 'removed' then
      new.status_before_removal := old.status;
    elsif old.applicability_override = 'removed' and new.applicability_override is null then
      new.status := old.status_before_removal;
      new.status_before_removal := null;
      new.override_reason := null;
      new.override_actor_id := null;
      new.override_at := null;
    end if;
  end if;
  if new.requirement_origin = 'manual' then
    if new.context_type not in ('transaction', 'private_listing', 'buyer_lead', 'seller_lead')
       or coalesce(new.requested_from_role, '') not in ('buyer', 'seller') then
      raise exception 'Manual requirements need a supported context and an exact buyer or seller party.' using errcode = '22023';
    end if;
    if new.subject_kind = 'person' then
      if new.requested_from_contact_id is distinct from new.subject_id then
        raise exception 'Person requirements must retain the exact contact identity.' using errcode = '22023';
      end if;
    elsif new.requested_from_contact_id is not null then
      raise exception 'Choose person scope for a contact-specific manual requirement.' using errcode = '22023';
    end if;
  end if;
  if new.applicability_override = 'removed' then
    new.status := 'not_applicable';
    new.override_at := coalesce(new.override_at, now());
    new.status_before_removal := coalesce(new.status_before_removal, 'pending');
  end if;
  return new;
end;
$$;
revoke all on function public.bridge_preserve_document_requirement_identity() from public, anon, authenticated;
create trigger document_requirement_identity_guard before insert or update
  on public.document_requirement_instances for each row
  execute function public.bridge_preserve_document_requirement_identity();

create function public.bridge_record_document_requirement_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.document_requirement_context_links(requirement_instance_id, context_type, context_id)
    values (new.id, new.context_type, new.context_id) on conflict do nothing;
  if tg_op = 'UPDATE' and new.applicability_override is distinct from old.applicability_override then
    insert into public.document_requirement_events(requirement_instance_id, event_type, actor_user_id, message, metadata_json)
    values (new.id, 'status_changed', coalesce(auth.uid(), new.override_actor_id, old.override_actor_id),
      case when new.applicability_override = 'removed' then 'Requirement removed from this context.' else 'Requirement restored in this context.' end,
      jsonb_build_object('source', 'manual_applicability', 'contextType', new.context_type, 'contextId', new.context_id,
        'previousStatus', old.status, 'newStatus', new.status, 'reason', coalesce(new.override_reason, old.override_reason)));
  end if;
  return new;
end;
$$;
revoke all on function public.bridge_record_document_requirement_context() from public, anon, authenticated;
create trigger document_requirement_context_record after insert or update
  on public.document_requirement_instances for each row
  execute function public.bridge_record_document_requirement_context();

-- Internal handover primitive; browser-facing mutation commands are stage 2.
-- Only an explicit source link in the same organisation is eligible. One
-- requirement may enter only one transaction; subsequent matters need their
-- own requirements rather than inheriting another matter's removal decision.
create function public.bridge_handoff_manual_document_requirements(p_transaction_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_transaction jsonb;
  v_source record;
  v_requirement public.document_requirement_instances%rowtype;
  v_count integer := 0;
begin
  select to_jsonb(t) into v_transaction from public.transactions t where id = p_transaction_id;
  if not found then raise exception 'Transaction not found.' using errcode = 'P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_transaction_id::text, 0));
  for v_source in
    select 'private_listing'::text context_type, l.id context_id, 'seller'::text party,
      public.bridge_can_access_private_listing(l.id) can_access
    from public.private_listings l
    where l.id::text in (v_transaction->>'private_listing_id', v_transaction->>'listing_id')
      and l.organisation_id::text = v_transaction->>'organisation_id'
    union
    select 'buyer_lead', l.lead_id, 'buyer',
      public.bridge_can_access_assignment(l.organisation_id, nullif(to_jsonb(l)->>'assigned_agent_id', '')::uuid, null)
    from public.leads l
    where l.lead_id::text in (v_transaction->>'originating_buyer_lead_id', v_transaction->>'originating_lead_id')
      and l.organisation_id::text = v_transaction->>'organisation_id'
      and lower(coalesce(l.lead_category, '')) = 'buyer'
    union
    select 'seller_lead', lead.lead_id, 'seller',
      public.bridge_can_access_private_listing(listing.id) and
      public.bridge_can_access_assignment(lead.organisation_id, nullif(to_jsonb(lead)->>'assigned_agent_id', '')::uuid, null)
    from public.private_listings listing join public.leads lead
      on lead.lead_id::text in (listing.seller_lead_id, listing.originating_crm_lead_id)
      and lead.organisation_id = listing.organisation_id
    where listing.id::text in (v_transaction->>'private_listing_id', v_transaction->>'listing_id')
      and listing.organisation_id::text = v_transaction->>'organisation_id'
      and lower(coalesce(lead.lead_category, '')) = 'seller'
  loop
    for v_requirement in select * from public.document_requirement_instances
      where context_type = v_source.context_type and context_id = v_source.context_id
        and requested_from_role = v_source.party
        and (requirement_origin = 'manual' or applicability_override = 'removed')
        and transaction_id is null
      order by id for update
    loop
      if coalesce(auth.role(), '') <> 'service_role' and (auth.uid() is null or not coalesce(v_source.can_access, false)) then
        raise exception 'Not authorised to hand over source document requirements.' using errcode = '42501';
      end if;
      if v_requirement.document_definition_key is not null and exists (
        select 1 from public.document_requirement_instances target
        where target.context_type = 'transaction' and target.context_id = p_transaction_id
          and target.document_definition_key = v_requirement.document_definition_key
          and target.requested_from_contact_id is not distinct from v_requirement.requested_from_contact_id
      ) then
        raise exception 'A target requirement already exists; explicit identity reconciliation is required.' using errcode = '23505';
      end if;
      update public.document_requirement_instances set context_type = 'transaction', context_id = p_transaction_id,
        transaction_id = p_transaction_id,
        listing_id = case when v_source.context_type = 'private_listing' then v_source.context_id else listing_id end
      where id = v_requirement.id;
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.bridge_handoff_manual_document_requirements(uuid) from public, anon, authenticated;
grant execute on function public.bridge_handoff_manual_document_requirements(uuid) to service_role;

-- Reconciliation reads follow the identity's earlier contexts too. Otherwise
-- a source listing could generate a second requirement after handover.
create schema if not exists document_requirement_private;
revoke all on schema document_requirement_private from public, anon, authenticated;
grant usage on schema document_requirement_private to authenticated, service_role;
create function document_requirement_private.read_document_requirements_for_reconciliation(p_context_type text, p_context_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_allowed boolean := false;
  v_result jsonb;
begin
  if p_context_type not in ('transaction', 'private_listing', 'buyer_lead', 'seller_lead') or p_context_id is null then
    raise exception 'Unsupported document context.' using errcode = '22023';
  end if;
  if coalesce(auth.role(), '') = 'service_role' then
    v_allowed := true;
  elsif auth.uid() is not null then
    if p_context_type = 'transaction' then
      v_allowed := public.bridge_has_transaction_permission(p_context_id, 'edit_core_transaction') or
        public.bridge_has_transaction_permission(p_context_id, 'manage_transfer_workflow') or
        public.bridge_has_transaction_permission(p_context_id, 'manage_bond_workflow');
    elsif p_context_type = 'private_listing' then
      v_allowed := public.bridge_can_access_private_listing(p_context_id);
    else
      select public.bridge_can_access_assignment(l.organisation_id, nullif(to_jsonb(l)->>'assigned_agent_id', '')::uuid, null)
        into v_allowed from public.leads l where l.lead_id = p_context_id
          and lower(coalesce(l.lead_category, '')) = case when p_context_type = 'buyer_lead' then 'buyer' else 'seller' end;
    end if;
  end if;
  if not coalesce(v_allowed, false) then
    raise exception 'Not authorised to read document requirements for reconciliation.' using errcode = '42501';
  end if;

  -- Source access alone must not expose a later transaction the actor cannot
  -- manage. Fail explicitly; an empty result would permit duplicate generation.
  if coalesce(auth.role(), '') <> 'service_role' and exists (
    select 1 from public.document_requirement_context_links link
    join public.document_requirement_instances r on r.id = link.requirement_instance_id
    where link.context_type = p_context_type and link.context_id = p_context_id
      and r.transaction_id is not null
      and not coalesce(public.bridge_has_transaction_permission(r.transaction_id, 'edit_core_transaction') or
        public.bridge_has_transaction_permission(r.transaction_id, 'manage_transfer_workflow') or
        public.bridge_has_transaction_permission(r.transaction_id, 'manage_bond_workflow'), false)
  ) then
    raise exception 'Not authorised to reconcile the linked transaction requirements.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.pack_key, r.id), '[]'::jsonb) into v_result
  from public.document_requirement_instances r
  where (r.context_type = p_context_type and r.context_id = p_context_id) or exists (
    select 1 from public.document_requirement_context_links link where link.requirement_instance_id = r.id
      and link.context_type = p_context_type and link.context_id = p_context_id
  );
  return v_result;
end;
$$;
revoke all on function document_requirement_private.read_document_requirements_for_reconciliation(text, uuid) from public, anon, authenticated;
grant execute on function document_requirement_private.read_document_requirements_for_reconciliation(text, uuid) to authenticated, service_role;
create function public.bridge_read_document_requirements_for_reconciliation(p_context_type text, p_context_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select document_requirement_private.read_document_requirements_for_reconciliation(p_context_type, p_context_id);
$$;
revoke all on function public.bridge_read_document_requirements_for_reconciliation(text, uuid) from public, anon, authenticated;
grant execute on function public.bridge_read_document_requirements_for_reconciliation(text, uuid) to authenticated, service_role;

-- Preserve the existing authorised resolver boundary and its exact party matching.
create or replace function public.bridge_sync_transaction_document_requirement_instances(
  p_transaction_id uuid,
  p_generated_instances jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item jsonb;
  v_definition public.document_definitions%rowtype;
  v_existing public.document_requirement_instances%rowtype;
  v_saved public.document_requirement_instances%rowtype;
  v_key text;
  v_pack text;
  v_level text;
  v_role text;
  v_contact uuid;
  v_reviewer text;
  v_rule uuid;
  v_gates text[];
  v_visible text[];
  v_upload text[];
  v_signature text;
  v_signatures text[] := '{}'::text[];
  v_active_ids uuid[] := '{}'::uuid[];
  v_created integer := 0;
  v_updated integer := 0;
  v_deactivated integer := 0;
begin
  if p_transaction_id is null or jsonb_typeof(p_generated_instances) <> 'array'
     or jsonb_array_length(p_generated_instances) not between 1 and 250 then
    raise exception 'A transaction and 1-250 generated requirements are required.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.transactions where id = p_transaction_id) then
    raise exception 'transaction not found' using errcode = 'P0002';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and (
    auth.uid() is null or not (
      public.bridge_has_transaction_permission(p_transaction_id, 'edit_core_transaction') or
      public.bridge_has_transaction_permission(p_transaction_id, 'manage_transfer_workflow') or
      public.bridge_has_transaction_permission(p_transaction_id, 'manage_bond_workflow') or
      public.bridge_can_access_transaction_spine(p_transaction_id)
    )
  ) then
    raise exception 'not authorised to generate transaction document requirements' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_transaction_id::text, 0));
  perform public.bridge_handoff_manual_document_requirements(p_transaction_id);
  for v_item in select value from jsonb_array_elements(p_generated_instances) loop
    v_key := nullif(btrim(v_item ->> 'document_definition_key'), '');
    select * into v_definition from public.document_definitions
      where key = v_key and is_active and 'transaction' = any(applies_to_context);
    if not found then raise exception 'active transaction document definition not found: %', v_key using errcode = '23503'; end if;

    v_pack := coalesce(nullif(btrim(v_item ->> 'pack_key'), ''), v_definition.pack_key);
    if not exists (select 1 from public.document_packs where key = v_pack and is_active and 'transaction' = any(applies_to_context)) then
      raise exception 'active transaction document pack not found: %', v_pack using errcode = '23503';
    end if;
    v_level := coalesce(nullif(btrim(v_item ->> 'requirement_level'), ''), v_definition.default_requirement_level, 'required');
    if v_level not in ('blocker','required','recommended','optional','not_applicable') then
      raise exception 'invalid requirement level: %', v_level using errcode = '22023';
    end if;
    v_role := nullif(btrim(v_item ->> 'requested_from_role'), '');
    v_contact := nullif(btrim(v_item ->> 'requested_from_contact_id'), '')::uuid;
    v_reviewer := nullif(btrim(v_item ->> 'reviewer_role'), '');
    v_rule := nullif(btrim(v_item ->> 'rule_id'), '')::uuid;
    select coalesce(array_agg(distinct value order by value), '{}'::text[]) into v_gates
      from jsonb_array_elements_text(coalesce(v_item -> 'stage_gates', '[]'::jsonb));
    select coalesce(array_agg(distinct value order by value), '{}'::text[]) into v_visible
      from jsonb_array_elements_text(coalesce(v_item -> 'visible_to_roles', to_jsonb(v_definition.default_visibility)));
    select coalesce(array_agg(distinct value order by value), '{}'::text[]) into v_upload
      from jsonb_array_elements_text(coalesce(v_item -> 'uploadable_by_roles', to_jsonb(v_definition.default_upload_roles)));

    v_signature := concat_ws('::', p_transaction_id::text, v_key, coalesce(v_contact::text, ''));
    if v_signature = any(v_signatures) then
      raise exception 'duplicate generated requirement identity: %', v_signature using errcode = '23505';
    end if;
    v_signatures := array_append(v_signatures, v_signature);

    select * into v_existing from public.document_requirement_instances
    where context_type = 'transaction' and context_id = p_transaction_id
      and document_definition_key = v_key
      and requested_from_contact_id is not distinct from v_contact
    order by (status <> 'not_applicable') desc, created_at desc limit 1 for update;

    if found and (v_existing.requirement_origin = 'manual' or v_existing.applicability_override = 'removed') then
      v_saved := v_existing;
    elsif found then
      update public.document_requirement_instances set
        transaction_id = p_transaction_id, listing_id = null, pack_key = v_pack,
        requirement_level = v_level, status = case when status = 'not_applicable' then 'pending' else status end,
        stage_gates = v_gates, requested_from_role = v_role, requested_from_contact_id = v_contact,
        visible_to_roles = v_visible, uploadable_by_roles = v_upload, reviewer_role = v_reviewer,
        rule_id = v_rule, resolver_version = 'transaction_canonical_document_requirement_engine_v2',
        source_system = 'transaction_canonical_document_requirement_engine', updated_at = now()
      where id = v_existing.id returning * into v_saved;
      v_updated := v_updated + 1;
    else
      insert into public.document_requirement_instances (
        document_definition_key, context_type, context_id, transaction_id, listing_id, pack_key,
        requirement_level, status, stage_gates, requested_from_role, requested_from_contact_id,
        visible_to_roles, uploadable_by_roles, reviewer_role, rule_id, resolver_version, source_system
      ) values (
        v_key, 'transaction', p_transaction_id, p_transaction_id, null, v_pack, v_level, 'pending',
        v_gates, v_role, v_contact, v_visible, v_upload, v_reviewer, v_rule,
        'transaction_canonical_document_requirement_engine_v2', 'transaction_canonical_document_requirement_engine'
      ) returning * into v_saved;
      v_created := v_created + 1;
    end if;
    v_active_ids := array_append(v_active_ids, v_saved.id);
  end loop;

  with stale as (
    update public.document_requirement_instances set status = 'not_applicable', updated_at = now()
    where context_type = 'transaction' and context_id = p_transaction_id and status <> 'not_applicable'
      and requirement_origin = 'matrix' and applicability_override is null
      and (source_system = 'transaction_canonical_document_requirement_engine' or rule_id is not null)
      and not (id = any(v_active_ids)) returning id
  ) select count(*)::integer into v_deactivated from stale;

  return jsonb_build_object(
    'transactionId', p_transaction_id, 'createdCount', v_created, 'updatedCount', v_updated,
    'markedNotApplicableCount', v_deactivated,
    'allInstances', coalesce((select jsonb_agg(to_jsonb(i) order by i.id)
      from public.document_requirement_instances i where i.context_type = 'transaction'
        and i.context_id = p_transaction_id), '[]'::jsonb),
    'instances', coalesce((select jsonb_agg(to_jsonb(i) order by i.pack_key, i.document_definition_key)
      from public.document_requirement_instances i where i.context_type='transaction'
        and i.context_id=p_transaction_id and i.status <> 'not_applicable'), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.bridge_sync_transaction_document_requirement_instances(uuid, jsonb) from public;
grant execute on function public.bridge_sync_transaction_document_requirement_instances(uuid, jsonb) to authenticated, service_role;


notify pgrst, 'reload schema';
commit;
