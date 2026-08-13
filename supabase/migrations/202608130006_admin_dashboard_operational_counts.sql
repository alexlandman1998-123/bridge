begin;

create or replace function public.arch9_admin_json_bool(
  p_row jsonb,
  p_keys text[],
  p_default boolean default false
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_key text;
  v_value text;
begin
  foreach v_key in array p_keys loop
    v_value := public.arch9_admin_normalize_token(p_row ->> v_key);
    if v_value in ('true', 't', 'yes', 'y', '1', 'active', 'published', 'live') then
      return true;
    end if;
    if v_value in ('false', 'f', 'no', 'n', '0', 'inactive', 'disabled') then
      return false;
    end if;
  end loop;

  return coalesce(p_default, false);
end;
$$;

create or replace function public.arch9_admin_token_any(p_row jsonb, p_keys text[])
returns text
language sql
immutable
set search_path = public
as $$
  select public.arch9_admin_normalize_token(array_to_string(array(
    select coalesce(p_row ->> key, '')
    from unnest(p_keys) as keys(key)
  ), ' '));
$$;

create or replace function public.arch9_admin_dashboard_snapshot(
  p_range_start timestamptz default date_trunc('month', now()),
  p_range_end timestamptz default now()
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_start timestamptz := coalesce(p_range_start, date_trunc('month', now()));
  v_end timestamptz := coalesce(p_range_end, now());
  v_organisations jsonb := '[]'::jsonb;
  v_profiles jsonb := '[]'::jsonb;
  v_organisation_users jsonb := '[]'::jsonb;
  v_listings jsonb := '[]'::jsonb;
  v_listing_publications jsonb := '[]'::jsonb;
  v_listing_external_links jsonb := '[]'::jsonb;
  v_transactions jsonb := '[]'::jsonb;
  v_row jsonb;
  v_status text;
  v_role text;
  v_stage text;
  v_listing_id text;
  v_agent_id text;
  v_agent_key text;
  v_signed_seller boolean;
  v_signed_buyer boolean;
  v_registered boolean;
  v_terminal boolean;
  v_listing_active boolean;
  v_listing_public boolean;
  v_registration_at timestamptz;
  v_last_activity_at timestamptz;
  v_revenue numeric;
  v_revenue_present boolean;
  v_operating_revenue_keys text[] := array[
    'arch9_revenue_amount',
    'platform_fee_amount',
    'platform_fee',
    'transaction_fee',
    'fee_amount',
    'revenue_amount'
  ];
  v_active_organisations integer := 0;
  v_active_agents integer := 0;
  v_active_listings integer := 0;
  v_active_transactions integer := 0;
  v_active_agent_keys text[] := array[]::text[];
  v_active_organisation_rows jsonb := '[]'::jsonb;
  v_active_agent_rows jsonb := '[]'::jsonb;
  v_active_listing_rows jsonb := '[]'::jsonb;
  v_active_transaction_rows jsonb := '[]'::jsonb;
  v_pipeline_count integer := 0;
  v_pipeline_revenue numeric := 0;
  v_registered_count integer := 0;
  v_registered_revenue numeric := 0;
  v_stalled_count integer := 0;
  v_pipeline_rows jsonb := '[]'::jsonb;
  v_registered_rows jsonb := '[]'::jsonb;
  v_attention_rows jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  if v_end < v_start then
    raise exception 'range end must be greater than or equal to range start' using errcode = '22023';
  end if;

  if not public.arch9_admin_can_access_dashboard() then
    raise exception 'admin dashboard access required' using errcode = '42501';
  end if;

  if to_regclass('public.organisations') is not null then
    v_organisations := public.arch9_admin_table_rows(to_regclass('public.organisations'));
  else
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('table', 'organisations', 'message', 'table missing'));
  end if;

  if to_regclass('public.profiles') is not null then
    v_profiles := public.arch9_admin_table_rows(to_regclass('public.profiles'));
  elsif to_regclass('public.users') is not null then
    v_profiles := public.arch9_admin_table_rows(to_regclass('public.users'));
  else
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('table', 'profiles', 'message', 'table missing'));
  end if;

  if to_regclass('public.organisation_users') is not null then
    v_organisation_users := public.arch9_admin_table_rows(to_regclass('public.organisation_users'));
  end if;

  if to_regclass('public.private_listings') is not null then
    v_listings := public.arch9_admin_table_rows(to_regclass('public.private_listings'));
  else
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('table', 'private_listings', 'message', 'table missing'));
  end if;

  if to_regclass('public.listing_publication_data') is not null then
    v_listing_publications := public.arch9_admin_table_rows(to_regclass('public.listing_publication_data'));
  end if;

  if to_regclass('public.listing_external_links') is not null then
    v_listing_external_links := public.arch9_admin_table_rows(to_regclass('public.listing_external_links'));
  end if;

  if to_regclass('public.transactions') is not null then
    v_transactions := public.arch9_admin_table_rows(to_regclass('public.transactions'));
  else
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('table', 'transactions', 'message', 'table missing'));
  end if;

  for v_row in select value from jsonb_array_elements(v_organisations) loop
    v_status := public.arch9_admin_normalize_token(public.arch9_admin_json_text(v_row, array['status', 'organisation_status', 'organization_status', 'is_active'], 'active'));
    if v_status not in ('inactive', 'archived', 'deleted', 'suspended', 'disabled', 'false') then
      v_active_organisations := v_active_organisations + 1;
      if jsonb_array_length(v_active_organisation_rows) < 50 then
        v_active_organisation_rows := v_active_organisation_rows || jsonb_build_array(jsonb_build_object(
          'id', v_row ->> 'id',
          'name', public.arch9_admin_json_text(v_row, array['name', 'organisation_name', 'organization_name', 'company_name'], 'Organisation'),
          'tradingName', public.arch9_admin_json_text(v_row, array['trading_name', 'tradingName', 'display_name'], ''),
          'status', coalesce(nullif(v_status, ''), 'active'),
          'ownerId', public.arch9_admin_json_text(v_row, array['owner_id', 'account_owner_id', 'created_by'], ''),
          'createdAt', public.arch9_admin_json_timestamp(v_row, array['created_at', 'inserted_at']),
          'updatedAt', public.arch9_admin_json_timestamp(v_row, array['updated_at', 'last_activity_at', 'created_at'])
        ));
      end if;
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(v_profiles) loop
    v_role := public.arch9_admin_token_any(v_row, array['role', 'app_role', 'system_role', 'workspace_role', 'organisation_role', 'organization_role', 'portal_role']);
    v_status := public.arch9_admin_normalize_token(public.arch9_admin_json_text(v_row, array['status', 'profile_status', 'is_active'], 'active'));
    v_agent_key := coalesce(nullif(v_row ->> 'id', ''), nullif(v_row ->> 'user_id', ''), nullif(lower(v_row ->> 'email'), ''));
    if v_agent_key is not null
      and v_role like '%agent%'
      and v_status not in ('inactive', 'archived', 'deleted', 'suspended', 'disabled', 'false', 'invited', 'pending')
      and not v_agent_key = any(v_active_agent_keys)
    then
      v_active_agent_keys := array_append(v_active_agent_keys, v_agent_key);
      v_active_agents := v_active_agents + 1;
      if jsonb_array_length(v_active_agent_rows) < 50 then
        v_active_agent_rows := v_active_agent_rows || jsonb_build_array(jsonb_build_object(
          'id', v_agent_key,
          'name', public.arch9_admin_json_text(v_row, array['full_name', 'name', 'display_name'], 'Agent'),
          'email', public.arch9_admin_json_text(v_row, array['email', 'email_address'], ''),
          'phone', public.arch9_admin_json_text(v_row, array['phone', 'mobile', 'cellphone'], ''),
          'role', 'agent',
          'status', coalesce(nullif(v_status, ''), 'active'),
          'organisationId', public.arch9_admin_json_text(v_row, array['organisation_id', 'organization_id', 'agency_id', 'company_id'], ''),
          'createdAt', public.arch9_admin_json_timestamp(v_row, array['created_at', 'inserted_at']),
          'updatedAt', public.arch9_admin_json_timestamp(v_row, array['last_activity_at', 'updated_at', 'created_at'])
        ));
      end if;
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(v_organisation_users) loop
    v_role := public.arch9_admin_token_any(v_row, array['role', 'app_role', 'workspace_role', 'organisation_role', 'organization_role']);
    v_status := public.arch9_admin_normalize_token(public.arch9_admin_json_text(v_row, array['status', 'membership_status', 'is_active'], 'active'));
    v_agent_key := coalesce(nullif(v_row ->> 'user_id', ''), nullif(v_row ->> 'profile_id', ''), nullif(v_row ->> 'id', ''), nullif(lower(v_row ->> 'email'), ''));
    if v_agent_key is not null
      and (v_role like '%agent%' or v_role in ('member', 'consultant', 'broker', 'commercial_broker'))
      and v_status not in ('inactive', 'archived', 'deleted', 'suspended', 'disabled', 'false', 'invited', 'pending')
      and not v_agent_key = any(v_active_agent_keys)
    then
      v_active_agent_keys := array_append(v_active_agent_keys, v_agent_key);
      v_active_agents := v_active_agents + 1;
      if jsonb_array_length(v_active_agent_rows) < 50 then
        v_active_agent_rows := v_active_agent_rows || jsonb_build_array(jsonb_build_object(
          'id', v_agent_key,
          'name', public.arch9_admin_json_text(v_row, array['full_name', 'name', 'display_name', 'email'], 'Agent'),
          'email', public.arch9_admin_json_text(v_row, array['email', 'email_address'], ''),
          'phone', public.arch9_admin_json_text(v_row, array['phone', 'mobile', 'cellphone'], ''),
          'role', coalesce(nullif(v_role, ''), 'member'),
          'status', coalesce(nullif(v_status, ''), 'active'),
          'organisationId', public.arch9_admin_json_text(v_row, array['organisation_id', 'organization_id', 'agency_id', 'company_id'], ''),
          'createdAt', public.arch9_admin_json_timestamp(v_row, array['created_at', 'inserted_at']),
          'updatedAt', public.arch9_admin_json_timestamp(v_row, array['last_active_at', 'updated_at', 'created_at'])
        ));
      end if;
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(v_listings) loop
    v_listing_id := v_row ->> 'id';
    v_status := public.arch9_admin_token_any(v_row, array[
      'listing_status',
      'status',
      'publication_status',
      'marketing_status',
      'listing_visibility',
      'bridge_listing_status',
      'property24_status',
      'private_property_status',
      'mandate_status'
    ]);
    v_listing_public := exists (
      select 1
      from jsonb_array_elements(v_listing_publications) publication
      where publication.value ->> 'listing_id' = v_listing_id
        and public.arch9_admin_normalize_token(publication.value ->> 'status') in ('published', 'live', 'active')
    ) or exists (
      select 1
      from jsonb_array_elements(v_listing_external_links) external_link
      where external_link.value ->> 'listing_id' = v_listing_id
        and public.arch9_admin_normalize_token(external_link.value ->> 'status') in ('published', 'live', 'active')
    );
    v_listing_active :=
      v_status ~ '(mandate_signed|active|listing_active|in_progress|live|published|finalised|finalized|fully_signed|signed|signed_uploaded|uploaded_signed|under_offer|transaction_created|active_market|public)'
      or public.arch9_admin_json_bool(v_row, array['is_active'], false)
      or v_listing_public;

    if v_listing_active
      and v_status !~ '(^|_)(inactive|archived|withdrawn|deleted|disabled|registered|sold|sold_archived)(_|$)'
    then
      v_active_listings := v_active_listings + 1;
      v_agent_id := public.arch9_admin_json_text(v_row, array['assigned_agent_id', 'agent_id', 'assigned_user_id', 'owner_user_id'], '');
      if v_agent_id <> '' and not v_agent_id = any(v_active_agent_keys) then
        v_active_agent_keys := array_append(v_active_agent_keys, v_agent_id);
        v_active_agents := v_active_agents + 1;
        if jsonb_array_length(v_active_agent_rows) < 50 then
          v_active_agent_rows := v_active_agent_rows || jsonb_build_array(jsonb_build_object(
            'id', v_agent_id,
            'name', 'Assigned agent',
            'email', '',
            'phone', '',
            'role', 'assigned_agent',
            'status', 'active_work',
            'organisationId', public.arch9_admin_json_text(v_row, array['organisation_id', 'organization_id', 'agency_id', 'company_id'], ''),
            'createdAt', public.arch9_admin_json_timestamp(v_row, array['created_at', 'inserted_at']),
            'updatedAt', public.arch9_admin_json_timestamp(v_row, array['updated_at', 'last_activity_at', 'created_at'])
          ));
        end if;
      end if;
      if jsonb_array_length(v_active_listing_rows) < 50 then
        v_active_listing_rows := v_active_listing_rows || jsonb_build_array(jsonb_build_object(
          'id', v_listing_id,
          'reference', public.arch9_admin_json_text(v_row, array['reference', 'listing_reference', 'code', 'id'], 'Listing'),
          'title', public.arch9_admin_json_text(v_row, array['title', 'property_title', 'name', 'reference'], 'Listing'),
          'location', public.arch9_admin_json_text(v_row, array['location', 'suburb', 'city', 'area'], ''),
          'address', public.arch9_admin_json_text(v_row, array['address', 'property_address', 'address_line_1'], ''),
          'status', coalesce(nullif(public.arch9_admin_json_text(v_row, array['listing_status', 'status', 'bridge_listing_status'], ''), ''), 'active'),
          'organisationId', public.arch9_admin_json_text(v_row, array['organisation_id', 'organization_id', 'agency_id', 'company_id'], ''),
          'agentId', v_agent_id,
          'price', public.arch9_admin_json_number(v_row, array['price', 'asking_price', 'listing_price', 'purchase_price'], 0),
          'createdAt', public.arch9_admin_json_timestamp(v_row, array['created_at', 'inserted_at']),
          'updatedAt', public.arch9_admin_json_timestamp(v_row, array['updated_at', 'last_activity_at', 'created_at'])
        ));
      end if;
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(v_transactions) loop
    v_status := public.arch9_admin_token_any(v_row, array['status', 'workflow_status', 'lifecycle_state', 'matter_status']);
    v_stage := public.arch9_admin_token_any(v_row, array['stage', 'transaction_stage', 'matter_stage', 'onboarding_status', 'current_stage', 'current_main_stage', 'stage_key']);
    v_registration_at := public.arch9_admin_json_timestamp(v_row, array['registration_date', 'registered_at', 'date_registered', 'transfer_registered_at']);
    v_last_activity_at := public.arch9_admin_json_timestamp(v_row, array['last_activity_at', 'updated_at', 'created_at']);
    v_revenue_present := public.arch9_admin_json_has_value(v_row, v_operating_revenue_keys);
    v_revenue := case
      when v_revenue_present then public.arch9_admin_json_number(v_row, v_operating_revenue_keys, 0)
      else 0
    end;
    v_registered := v_registration_at is not null
      or v_status like '%registered%'
      or v_stage like '%registered%'
      or v_stage like '%registration%';
    v_terminal := v_registered
      or v_status ~ '(^|_)(cancelled|canceled|closed|complete|completed|lost|deleted|archived)(_|$)'
      or v_stage ~ '(^|_)(cancelled|canceled|closed|complete|completed|lost|deleted|archived)(_|$)';
    v_signed_seller := public.arch9_admin_json_timestamp(v_row, array['seller_signed_at', 'seller_signature_at', 'seller_otp_signed_at', 'mandate_signed_at']) is not null
      or v_status like '%seller_signed%'
      or v_stage like '%seller_signed%'
      or v_status like '%signed_seller%'
      or v_stage like '%signed_seller%'
      or v_stage like '%mandate_signed%';
    v_signed_buyer := public.arch9_admin_json_timestamp(v_row, array['buyer_signed_at', 'buyer_signature_at', 'buyer_otp_signed_at', 'otp_signed_date', 'offer_signed_at', 'signed_at']) is not null
      or v_status like '%buyer_signed%'
      or v_stage like '%buyer_signed%'
      or v_status like '%signed_buyer%'
      or v_stage like '%signed_buyer%'
      or v_stage like '%otp_signed%'
      or v_status like '%otp_signed%'
      or v_stage like '%offer_accepted%'
      or v_status like '%offer_accepted%';

    if not v_terminal then
      v_active_transactions := v_active_transactions + 1;
      v_agent_id := public.arch9_admin_json_text(v_row, array['assigned_agent_id', 'agent_id', 'assigned_user_id', 'owner_user_id'], '');
      if v_agent_id <> '' and not v_agent_id = any(v_active_agent_keys) then
        v_active_agent_keys := array_append(v_active_agent_keys, v_agent_id);
        v_active_agents := v_active_agents + 1;
      end if;
      if jsonb_array_length(v_active_transaction_rows) < 25 then
        v_active_transaction_rows := v_active_transaction_rows || jsonb_build_array(jsonb_build_object(
          'id', v_row ->> 'id',
          'reference', public.arch9_admin_json_text(v_row, array['reference', 'matter_number', 'transaction_reference', 'id'], 'Transaction'),
          'organisationId', public.arch9_admin_json_text(v_row, array['organisation_id', 'organization_id', 'agency_id', 'company_id'], ''),
          'agentId', v_agent_id,
          'buyer', public.arch9_admin_json_text(v_row, array['buyer_name', 'buyer_full_name', 'buyer'], ''),
          'seller', public.arch9_admin_json_text(v_row, array['seller_name', 'seller_full_name', 'seller'], ''),
          'stage', coalesce(nullif(v_stage, ''), v_status, 'active'),
          'revenue', v_revenue,
          'revenueMissing', not v_revenue_present,
          'lastActivityAt', v_last_activity_at
        ));
      end if;
    end if;

    if v_signed_seller and v_signed_buyer and not v_terminal then
      v_pipeline_count := v_pipeline_count + 1;
      v_pipeline_revenue := v_pipeline_revenue + v_revenue;
      if jsonb_array_length(v_pipeline_rows) < 25 then
        v_pipeline_rows := v_pipeline_rows || jsonb_build_array(jsonb_build_object(
          'id', v_row ->> 'id',
          'reference', public.arch9_admin_json_text(v_row, array['reference', 'matter_number', 'transaction_reference', 'id'], 'Transaction'),
          'organisationId', public.arch9_admin_json_text(v_row, array['organisation_id', 'organization_id', 'agency_id', 'company_id'], ''),
          'agentId', public.arch9_admin_json_text(v_row, array['assigned_agent_id', 'agent_id', 'assigned_user_id', 'owner_user_id'], ''),
          'buyer', public.arch9_admin_json_text(v_row, array['buyer_name', 'buyer_full_name', 'buyer'], ''),
          'seller', public.arch9_admin_json_text(v_row, array['seller_name', 'seller_full_name', 'seller'], ''),
          'stage', coalesce(nullif(v_stage, ''), v_status),
          'revenue', v_revenue,
          'revenueMissing', not v_revenue_present,
          'lastActivityAt', v_last_activity_at
        ));
      end if;
      if not v_revenue_present and jsonb_array_length(v_warnings) < 100 then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'type', 'missing_revenue',
          'context', 'pipeline',
          'id', v_row ->> 'id',
          'reference', public.arch9_admin_json_text(v_row, array['reference', 'matter_number', 'transaction_reference', 'id'], 'Transaction'),
          'message', 'Signed pipeline transaction has no Arch9 operating revenue field.'
        ));
      end if;
    end if;

    if v_registered and coalesce(v_registration_at, v_last_activity_at, now()) >= v_start and coalesce(v_registration_at, v_last_activity_at, now()) <= v_end then
      v_registered_count := v_registered_count + 1;
      v_registered_revenue := v_registered_revenue + v_revenue;
      if jsonb_array_length(v_registered_rows) < 25 then
        v_registered_rows := v_registered_rows || jsonb_build_array(jsonb_build_object(
          'id', v_row ->> 'id',
          'reference', public.arch9_admin_json_text(v_row, array['reference', 'matter_number', 'transaction_reference', 'id'], 'Transaction'),
          'organisationId', public.arch9_admin_json_text(v_row, array['organisation_id', 'organization_id', 'agency_id', 'company_id'], ''),
          'agentId', public.arch9_admin_json_text(v_row, array['assigned_agent_id', 'agent_id', 'assigned_user_id', 'owner_user_id'], ''),
          'buyer', public.arch9_admin_json_text(v_row, array['buyer_name', 'buyer_full_name', 'buyer'], ''),
          'seller', public.arch9_admin_json_text(v_row, array['seller_name', 'seller_full_name', 'seller'], ''),
          'registeredAt', coalesce(v_registration_at, v_last_activity_at),
          'revenue', v_revenue,
          'revenueMissing', not v_revenue_present
        ));
      end if;
      if not v_revenue_present and jsonb_array_length(v_warnings) < 100 then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'type', 'missing_revenue',
          'context', 'registered',
          'id', v_row ->> 'id',
          'reference', public.arch9_admin_json_text(v_row, array['reference', 'matter_number', 'transaction_reference', 'id'], 'Transaction'),
          'message', 'Registered transaction has no Arch9 operating revenue field.'
        ));
      end if;
    end if;

    if not v_registered
      and not v_terminal
      and v_last_activity_at is not null
      and v_last_activity_at < now() - interval '14 days'
    then
      v_stalled_count := v_stalled_count + 1;
      if jsonb_array_length(v_attention_rows) < 25 then
        v_attention_rows := v_attention_rows || jsonb_build_array(jsonb_build_object(
          'type', 'stalled_transaction',
          'priority', case when v_last_activity_at < now() - interval '30 days' then 'high' else 'medium' end,
          'id', v_row ->> 'id',
          'reference', public.arch9_admin_json_text(v_row, array['reference', 'matter_number', 'transaction_reference', 'id'], 'Transaction'),
          'stage', coalesce(nullif(v_stage, ''), v_status),
          'lastActivityAt', v_last_activity_at,
          'suggestedAction', 'Review transaction progress and assign an owner for follow-up.'
        ));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'generatedAt', now(),
    'range', jsonb_build_object('start', v_start, 'end', v_end),
    'kpis', jsonb_build_object(
      'activeOrganisations', v_active_organisations,
      'activeAgents', v_active_agents,
      'activeListings', v_active_listings,
      'activeTransactions', v_active_transactions,
      'pipelineRevenue', v_pipeline_revenue,
      'registeredRevenueThisMonth', v_registered_revenue,
      'sellerSignedBuyerSigned', v_pipeline_count,
      'registeredThisMonth', v_registered_count,
      'stalledTransactions', v_stalled_count
    ),
    'revenue', jsonb_build_object(
      'pipeline', jsonb_build_object(
        'label', 'Seller and buyer signed, not registered',
        'count', v_pipeline_count,
        'amount', v_pipeline_revenue
      ),
      'registeredThisMonth', jsonb_build_object(
        'count', v_registered_count,
        'amount', v_registered_revenue
      )
    ),
    'drilldowns', jsonb_build_object(
      'activeOrganisations', v_active_organisation_rows,
      'activeAgents', v_active_agent_rows,
      'activeListings', v_active_listing_rows,
      'activeTransactions', v_active_transaction_rows
    ),
    'activeTransactions', v_active_transaction_rows,
    'pipeline', v_pipeline_rows,
    'registered', v_registered_rows,
    'attention', v_attention_rows,
    'warnings', v_warnings
  );
end;
$$;

grant execute on function public.arch9_admin_json_bool(jsonb, text[], boolean) to authenticated;
grant execute on function public.arch9_admin_token_any(jsonb, text[]) to authenticated;
grant execute on function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz) to authenticated;

comment on function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz)
  is 'Admin portal dashboard contract with operational listing, agent, and active transaction counts aligned to current Arch9 listing/transaction shapes.';

commit;
