begin;

-- Transaction creation resolves rules in the authenticated application, but the
-- canonical instance tables remain service-only. Expose active rule metadata as
-- read-only inputs and keep all canonical writes behind the scoped RPC below.
drop policy if exists document_requirement_rules_authenticated_active_read
  on public.document_requirement_rules;
create policy document_requirement_rules_authenticated_active_read
  on public.document_requirement_rules
  for select
  to authenticated
  using (is_active = true);

grant select on table public.document_requirement_rules to authenticated;

create or replace function public.bridge_sync_transaction_document_requirement_instances(
  p_transaction_id uuid,
  p_generated_instances jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_definition public.document_definitions%rowtype;
  v_existing public.document_requirement_instances%rowtype;
  v_saved public.document_requirement_instances%rowtype;
  v_definition_key text;
  v_pack_key text;
  v_requirement_level text;
  v_requested_from_role text;
  v_requested_from_contact_id uuid;
  v_rule_id uuid;
  v_reviewer_role text;
  v_stage_gates text[];
  v_visible_to_roles text[];
  v_uploadable_by_roles text[];
  v_signature text;
  v_seen_signatures text[] := '{}'::text[];
  v_active_ids uuid[] := '{}'::uuid[];
  v_created_count integer := 0;
  v_updated_count integer := 0;
  v_reactivated_count integer := 0;
  v_marked_not_applicable_count integer := 0;
  v_source_system constant text := 'transaction_canonical_document_requirement_engine';
  v_resolver_version constant text := 'transaction_canonical_document_requirement_engine_v1';
begin
  if p_transaction_id is null then
    raise exception 'transactionId is required' using errcode = '22023';
  end if;

  if p_generated_instances is null
     or jsonb_typeof(p_generated_instances) <> 'array'
     or jsonb_array_length(p_generated_instances) = 0
  then
    raise exception 'generated canonical requirement instances must be a non-empty array'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_generated_instances) > 250 then
    raise exception 'generated canonical requirement instance limit exceeded'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.transactions t
    where t.id = p_transaction_id
  ) then
    raise exception 'transaction not found' using errcode = 'P0002';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and (
       auth.uid() is null
       or not (
         public.bridge_has_transaction_permission(p_transaction_id, 'edit_core_transaction')
         or public.bridge_has_transaction_permission(p_transaction_id, 'manage_transfer_workflow')
         or public.bridge_has_transaction_permission(p_transaction_id, 'manage_bond_workflow')
         or public.bridge_can_access_transaction_spine(p_transaction_id)
       )
     )
  then
    raise exception 'not authorised to generate transaction document requirements'
      using errcode = '42501';
  end if;

  -- Serialize retries for the same transaction so the partial active-instance
  -- uniqueness rule cannot be raced by two creation submissions.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_transaction_id::text, 0)
  );

  for v_item in
    select value
    from jsonb_array_elements(p_generated_instances)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'each generated requirement must be an object'
        using errcode = '22023';
    end if;

    v_definition_key := nullif(btrim(v_item ->> 'document_definition_key'), '');
    if v_definition_key is null then
      raise exception 'document_definition_key is required'
        using errcode = '22023';
    end if;

    select d.*
    into v_definition
    from public.document_definitions d
    where d.key = v_definition_key
      and d.is_active = true
      and 'transaction' = any(d.applies_to_context);

    if not found then
      raise exception 'active transaction document definition not found: %', v_definition_key
        using errcode = '23503';
    end if;

    v_pack_key := coalesce(nullif(btrim(v_item ->> 'pack_key'), ''), v_definition.pack_key);
    if not exists (
      select 1
      from public.document_packs p
      where p.key = v_pack_key
        and p.is_active = true
        and 'transaction' = any(p.applies_to_context)
    ) then
      raise exception 'active transaction document pack not found: %', v_pack_key
        using errcode = '23503';
    end if;

    v_requirement_level := coalesce(
      nullif(btrim(v_item ->> 'requirement_level'), ''),
      v_definition.default_requirement_level,
      'required'
    );
    if v_requirement_level not in ('blocker', 'required', 'recommended', 'optional', 'not_applicable') then
      raise exception 'invalid requirement level: %', v_requirement_level
        using errcode = '22023';
    end if;

    v_requested_from_role := nullif(btrim(v_item ->> 'requested_from_role'), '');
    v_requested_from_contact_id := nullif(btrim(v_item ->> 'requested_from_contact_id'), '')::uuid;
    v_rule_id := nullif(btrim(v_item ->> 'rule_id'), '')::uuid;
    v_reviewer_role := nullif(btrim(v_item ->> 'reviewer_role'), '');

    if v_rule_id is not null and not exists (
      select 1
      from public.document_requirement_rules r
      where r.id = v_rule_id
        and r.is_active = true
        and r.context_type = 'transaction'
        and r.document_definition_key = v_definition_key
    ) then
      raise exception 'active transaction document rule not found: %', v_rule_id
        using errcode = '23503';
    end if;

    if coalesce(jsonb_typeof(v_item -> 'stage_gates'), 'array') <> 'array'
       or coalesce(jsonb_typeof(v_item -> 'visible_to_roles'), 'array') <> 'array'
       or coalesce(jsonb_typeof(v_item -> 'uploadable_by_roles'), 'array') <> 'array'
    then
      raise exception 'requirement role and stage fields must be arrays'
        using errcode = '22023';
    end if;

    select coalesce(array_agg(distinct value order by value), '{}'::text[])
    into v_stage_gates
    from jsonb_array_elements_text(coalesce(v_item -> 'stage_gates', '[]'::jsonb));

    select coalesce(array_agg(distinct value order by value), '{}'::text[])
    into v_visible_to_roles
    from jsonb_array_elements_text(coalesce(v_item -> 'visible_to_roles', to_jsonb(v_definition.default_visibility)));

    select coalesce(array_agg(distinct value order by value), '{}'::text[])
    into v_uploadable_by_roles
    from jsonb_array_elements_text(coalesce(v_item -> 'uploadable_by_roles', to_jsonb(v_definition.default_upload_roles)));

    v_signature := concat_ws(
      '::',
      p_transaction_id::text,
      v_definition_key,
      coalesce(v_requested_from_role, ''),
      coalesce(v_requested_from_contact_id::text, '')
    );
    if v_signature = any(v_seen_signatures) then
      raise exception 'duplicate generated requirement signature: %', v_signature
        using errcode = '23505';
    end if;
    v_seen_signatures := array_append(v_seen_signatures, v_signature);

    select i.*
    into v_existing
    from public.document_requirement_instances i
    where i.context_type = 'transaction'
      and i.context_id = p_transaction_id
      and i.document_definition_key = v_definition_key
      and i.requested_from_role is not distinct from v_requested_from_role
      and i.requested_from_contact_id is not distinct from v_requested_from_contact_id
    order by (i.status <> 'not_applicable') desc, i.created_at desc
    limit 1
    for update;

    if found then
      update public.document_requirement_instances i
      set
        transaction_id = p_transaction_id,
        listing_id = null,
        pack_key = v_pack_key,
        requirement_level = v_requirement_level,
        status = case when i.status = 'not_applicable' then 'pending' else i.status end,
        stage_gates = v_stage_gates,
        requested_from_role = v_requested_from_role,
        requested_from_contact_id = v_requested_from_contact_id,
        visible_to_roles = v_visible_to_roles,
        uploadable_by_roles = v_uploadable_by_roles,
        reviewer_role = v_reviewer_role,
        rule_id = v_rule_id,
        resolver_version = v_resolver_version,
        source_system = v_source_system,
        updated_at = now()
      where i.id = v_existing.id
      returning i.* into v_saved;

      v_updated_count := v_updated_count + 1;
      if v_existing.status = 'not_applicable' then
        v_reactivated_count := v_reactivated_count + 1;
      end if;

      insert into public.document_requirement_events (
        requirement_instance_id,
        event_type,
        actor_role,
        actor_user_id,
        metadata_json
      ) values (
        v_saved.id,
        case when v_existing.status = 'not_applicable' then 'reactivated' else 'regenerated' end,
        'system',
        auth.uid(),
        jsonb_build_object(
          'source_system', v_source_system,
          'resolver_version', v_resolver_version,
          'transaction_id', p_transaction_id
        )
      );
    else
      insert into public.document_requirement_instances (
        document_definition_key,
        context_type,
        context_id,
        transaction_id,
        listing_id,
        pack_key,
        requirement_level,
        status,
        stage_gates,
        requested_from_role,
        requested_from_contact_id,
        visible_to_roles,
        uploadable_by_roles,
        reviewer_role,
        rule_id,
        resolver_version,
        source_system
      ) values (
        v_definition_key,
        'transaction',
        p_transaction_id,
        p_transaction_id,
        null,
        v_pack_key,
        v_requirement_level,
        'pending',
        v_stage_gates,
        v_requested_from_role,
        v_requested_from_contact_id,
        v_visible_to_roles,
        v_uploadable_by_roles,
        v_reviewer_role,
        v_rule_id,
        v_resolver_version,
        v_source_system
      )
      returning * into v_saved;

      v_created_count := v_created_count + 1;

      insert into public.document_requirement_events (
        requirement_instance_id,
        event_type,
        actor_role,
        actor_user_id,
        metadata_json
      ) values (
        v_saved.id,
        'created',
        'system',
        auth.uid(),
        jsonb_build_object(
          'source_system', v_source_system,
          'resolver_version', v_resolver_version,
          'transaction_id', p_transaction_id
        )
      );
    end if;

    if not v_saved.id = any(v_active_ids) then
      v_active_ids := array_append(v_active_ids, v_saved.id);
    end if;
  end loop;

  with stale as (
    update public.document_requirement_instances i
    set
      status = 'not_applicable',
      resolver_version = v_resolver_version,
      source_system = v_source_system,
      updated_at = now()
    where i.context_type = 'transaction'
      and i.context_id = p_transaction_id
      and i.status <> 'not_applicable'
      and (i.source_system = v_source_system or i.rule_id is not null)
      and not (i.id = any(v_active_ids))
    returning i.id
  ), event_rows as (
    insert into public.document_requirement_events (
      requirement_instance_id,
      event_type,
      actor_role,
      actor_user_id,
      metadata_json
    )
    select
      stale.id,
      'marked_not_applicable',
      'system',
      auth.uid(),
      jsonb_build_object(
        'source_system', v_source_system,
        'resolver_version', v_resolver_version,
        'transaction_id', p_transaction_id
      )
    from stale
    returning 1
  )
  select count(*)::integer
  into v_marked_not_applicable_count
  from event_rows;

  return jsonb_build_object(
    'transactionId', p_transaction_id,
    'createdCount', v_created_count,
    'updatedCount', v_updated_count,
    'reactivatedCount', v_reactivated_count,
    'markedNotApplicableCount', v_marked_not_applicable_count,
    'instances', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.pack_key, i.document_definition_key, i.created_at)
      from public.document_requirement_instances i
      where i.context_type = 'transaction'
        and i.context_id = p_transaction_id
        and i.status <> 'not_applicable'
    ), '[]'::jsonb),
    'allInstances', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.pack_key, i.document_definition_key, i.created_at)
      from public.document_requirement_instances i
      where i.context_type = 'transaction'
        and i.context_id = p_transaction_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.bridge_sync_transaction_document_requirement_instances(uuid, jsonb)
  from public, anon;
grant execute on function public.bridge_sync_transaction_document_requirement_instances(uuid, jsonb)
  to authenticated, service_role;

comment on function public.bridge_sync_transaction_document_requirement_instances(uuid, jsonb) is
  'Reconciles canonical transaction document requirement instances for an authorised transaction creator. Legacy checklist rows are intentionally excluded and must be projected from returned canonical instance IDs.';

notify pgrst, 'reload schema';

commit;
