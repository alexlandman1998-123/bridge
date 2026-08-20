begin;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(to_regprocedure('public.arch9_admin_dashboard_snapshot(timestamptz,timestamptz)'))
  into v_definition;

  if v_definition is null then
    raise exception 'public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz) does not exist; apply the admin dashboard base migration first';
  end if;

  if position('v_units jsonb := ''[]''::jsonb' in v_definition) > 0 then
    raise notice 'arch9_admin_dashboard_snapshot already includes unit listing inventory';
  else
    if position('v_listings jsonb := ''[]''::jsonb;' in v_definition) = 0 then
      raise exception 'Unable to patch admin dashboard function: listings declaration not found';
    end if;

    v_definition := replace(
      v_definition,
      '  v_listings jsonb := ''[]''::jsonb;',
      '  v_listings jsonb := ''[]''::jsonb;
  v_developments jsonb := ''[]''::jsonb;
  v_units jsonb := ''[]''::jsonb;'
    );

    if position('v_transactions jsonb := ''[]''::jsonb;' in v_definition) = 0 then
      raise exception 'Unable to patch admin dashboard function: transactions declaration not found';
    end if;

    v_definition := replace(
      v_definition,
      '  v_transactions jsonb := ''[]''::jsonb;',
      '  v_transactions jsonb := ''[]''::jsonb;
  v_development_row jsonb;'
    );

    if position('v_listing_id text;' in v_definition) = 0 then
      raise exception 'Unable to patch admin dashboard function: listing id declaration not found';
    end if;

    v_definition := replace(
      v_definition,
      '  v_listing_id text;',
      '  v_listing_id text;
  v_development_id text;
  v_unit_id text;'
    );

    if position('v_listing_public boolean;' in v_definition) = 0 then
      raise exception 'Unable to patch admin dashboard function: listing public declaration not found';
    end if;

    v_definition := replace(
      v_definition,
      '  v_listing_public boolean;',
      '  v_listing_public boolean;
  v_development_active boolean;
  v_unit_active boolean;'
    );

    if position('v_active_agent_keys text[] := array[]::text[];' in v_definition) = 0 then
      raise exception 'Unable to patch admin dashboard function: active agent keys declaration not found';
    end if;

    v_definition := replace(
      v_definition,
      '  v_active_agent_keys text[] := array[]::text[];',
      '  v_active_agent_keys text[] := array[]::text[];
  v_active_unit_keys text[] := array[]::text[];'
    );

    if position('  if to_regclass(''public.listing_publication_data'') is not null then' in v_definition) = 0 then
      raise exception 'Unable to patch admin dashboard function: listing publication loading block not found';
    end if;

    v_definition := replace(
      v_definition,
      '  if to_regclass(''public.listing_publication_data'') is not null then',
      '  if to_regclass(''public.developments'') is not null then
    v_developments := public.arch9_admin_table_rows(to_regclass(''public.developments''));
  end if;

  if to_regclass(''public.units'') is not null then
    v_units := public.arch9_admin_table_rows(to_regclass(''public.units''));
  end if;

  if to_regclass(''public.listing_publication_data'') is not null then'
    );

    if position('      v_active_listings := v_active_listings + 1;' in v_definition) = 0 then
      raise exception 'Unable to patch admin dashboard function: active listing increment not found';
    end if;

    v_definition := replace(
      v_definition,
      '      v_active_listings := v_active_listings + 1;',
      '      v_unit_id := public.arch9_admin_json_text(v_row, array[''unit_id'', ''unitId''], '''');
      if v_unit_id <> '''' and not v_unit_id = any(v_active_unit_keys) then
        v_active_unit_keys := array_append(v_active_unit_keys, v_unit_id);
      end if;
      v_active_listings := v_active_listings + 1;'
    );

    if position('          ''reference'', public.arch9_admin_json_text(v_row, array[''reference'', ''listing_reference'', ''code'', ''id''], ''Listing''),' in v_definition) = 0 then
      raise exception 'Unable to patch admin dashboard function: listing row reference field not found';
    end if;

    v_definition := replace(
      v_definition,
      '          ''reference'', public.arch9_admin_json_text(v_row, array[''reference'', ''listing_reference'', ''code'', ''id''], ''Listing''),',
      '          ''unitId'', v_unit_id,
          ''reference'', public.arch9_admin_json_text(v_row, array[''reference'', ''listing_reference'', ''code'', ''id''], ''Listing''),'
    );

    if position('  for v_row in select value from jsonb_array_elements(v_transactions) loop' in v_definition) = 0 then
      raise exception 'Unable to patch admin dashboard function: transactions loop not found';
    end if;

    v_definition := replace(
      v_definition,
      '  for v_row in select value from jsonb_array_elements(v_transactions) loop',
      '  for v_row in select value from jsonb_array_elements(v_units) loop
    v_unit_id := public.arch9_admin_json_text(v_row, array[''id'', ''unit_id'', ''unitId''], '''');
    v_development_id := public.arch9_admin_json_text(v_row, array[''development_id'', ''developmentId''], '''');
    v_development_row := null;

    if v_development_id <> '''' then
      select value
      into v_development_row
      from jsonb_array_elements(v_developments)
      where value ->> ''id'' = v_development_id
      limit 1;
    end if;

    v_status := public.arch9_admin_token_any(v_row, array[
      ''status'',
      ''unit_status'',
      ''sales_status'',
      ''availability_status'',
      ''listing_status'',
      ''publication_status'',
      ''marketing_status''
    ]);
    v_unit_active :=
      coalesce(nullif(v_status, ''''), ''available'') !~ ''(^|_)(sold|registered|transferred|archived|withdrawn|deleted|disabled|unavailable|cancelled|canceled)(_|$)''
      and (
        v_status = ''''
        or v_status ~ ''(available|active|live|listed|published|launched|reserved|under_offer|pending_sale|sale_pending|in_progress)''
        or public.arch9_admin_json_bool(v_row, array[''is_active'', ''active''], true)
      );

    v_development_active := true;
    if v_development_row is not null then
      v_status := public.arch9_admin_normalize_token(public.arch9_admin_json_text(v_development_row, array[''status'', ''development_status'', ''is_active''], ''active''));
      v_development_active := v_status !~ ''(^|_)(inactive|archived|withdrawn|deleted|disabled|cancelled|canceled|complete|completed|sold_out)(_|$)'';
    end if;

    if v_unit_id <> ''''
      and v_unit_active
      and v_development_active
      and not v_unit_id = any(v_active_unit_keys)
    then
      v_active_unit_keys := array_append(v_active_unit_keys, v_unit_id);
      v_active_listings := v_active_listings + 1;
      v_agent_id := public.arch9_admin_json_text(v_row, array[''assigned_agent_id'', ''agent_id'', ''assigned_user_id'', ''owner_user_id''], '''');
      if v_agent_id <> '''' and not v_agent_id = any(v_active_agent_keys) then
        v_active_agent_keys := array_append(v_active_agent_keys, v_agent_id);
        v_active_agents := v_active_agents + 1;
        if jsonb_array_length(v_active_agent_rows) < 50 then
          v_active_agent_rows := v_active_agent_rows || jsonb_build_array(jsonb_build_object(
            ''id'', v_agent_id,
            ''name'', ''Assigned agent'',
            ''email'', '''',
            ''phone'', '''',
            ''role'', ''assigned_agent'',
            ''status'', ''active_work'',
            ''organisationId'', coalesce(
              nullif(public.arch9_admin_json_text(v_row, array[''organisation_id'', ''organization_id'', ''agency_id'', ''company_id''], ''''), ''''),
              public.arch9_admin_json_text(coalesce(v_development_row, ''{}''::jsonb), array[''organisation_id'', ''organization_id'', ''agency_id'', ''company_id''], '''')
            ),
            ''createdAt'', public.arch9_admin_json_timestamp(v_row, array[''created_at'', ''inserted_at'']),
            ''updatedAt'', public.arch9_admin_json_timestamp(v_row, array[''updated_at'', ''last_activity_at'', ''created_at''])
          ));
        end if;
      end if;
      if jsonb_array_length(v_active_listing_rows) < 50 then
        v_active_listing_rows := v_active_listing_rows || jsonb_build_array(jsonb_build_object(
          ''id'', v_unit_id,
          ''unitId'', v_unit_id,
          ''source'', ''unit'',
          ''developmentId'', v_development_id,
          ''reference'', public.arch9_admin_json_text(v_row, array[''unit_number'', ''unitNumber'', ''unit_label'', ''unitLabel'', ''reference'', ''code'', ''id''], ''Unit''),
          ''title'', concat_ws(
            '' - '',
            nullif(public.arch9_admin_json_text(coalesce(v_development_row, ''{}''::jsonb), array[''name'', ''development_name'', ''display_name''], ''''), ''''),
            concat(''Unit '', public.arch9_admin_json_text(v_row, array[''unit_number'', ''unitNumber'', ''unit_label'', ''unitLabel''], v_unit_id))
          ),
          ''location'', public.arch9_admin_json_text(coalesce(v_development_row, ''{}''::jsonb), array[''location'', ''suburb'', ''city'', ''area''], ''''),
          ''address'', public.arch9_admin_json_text(coalesce(v_development_row, ''{}''::jsonb), array[''address'', ''property_address'', ''address_line_1''], ''''),
          ''status'', coalesce(nullif(public.arch9_admin_json_text(v_row, array[''status'', ''unit_status'', ''sales_status'', ''availability_status''], ''''), ''''), ''available''),
          ''organisationId'', coalesce(
            nullif(public.arch9_admin_json_text(v_row, array[''organisation_id'', ''organization_id'', ''agency_id'', ''company_id''], ''''), ''''),
            public.arch9_admin_json_text(coalesce(v_development_row, ''{}''::jsonb), array[''organisation_id'', ''organization_id'', ''agency_id'', ''company_id''], '''')
          ),
          ''agentId'', v_agent_id,
          ''price'', public.arch9_admin_json_number(v_row, array[''current_price'', ''currentPrice'', ''list_price'', ''listPrice'', ''price''], 0),
          ''createdAt'', public.arch9_admin_json_timestamp(v_row, array[''created_at'', ''inserted_at'']),
          ''updatedAt'', public.arch9_admin_json_timestamp(v_row, array[''updated_at'', ''last_activity_at'', ''created_at''])
        ));
      end if;
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(v_transactions) loop'
    );

    execute v_definition;
  end if;
end $$;

alter function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz)
  security definer;

grant execute on function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz) to authenticated;

comment on function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz)
  is 'Admin portal dashboard contract with guarded platform-wide counts for organisations, agent-module users, private listings, development units as listing inventory, and transactions.';

notify pgrst, 'reload schema';

commit;
