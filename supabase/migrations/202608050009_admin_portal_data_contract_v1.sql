-- Phase 2: Admin portal data contract.
-- Keep these RPCs JSON-first so the replacement admin UI consumes a stable
-- operating contract instead of rebuilding business truth in React.

create or replace function public.arch9_admin_normalize_token(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(coalesce(trim(p_value), ''), '[[:space:]-]+', '_', 'g'));
$$;

create or replace function public.arch9_admin_json_text(
  p_row jsonb,
  p_keys text[],
  p_default text default ''
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_key text;
  v_value text;
begin
  foreach v_key in array p_keys loop
    v_value := nullif(trim(coalesce(p_row ->> v_key, '')), '');
    if v_value is not null then
      return v_value;
    end if;
  end loop;

  return coalesce(p_default, '');
end;
$$;

create or replace function public.arch9_admin_json_number(
  p_row jsonb,
  p_keys text[],
  p_default numeric default 0
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_key text;
  v_value text;
  v_number numeric;
begin
  foreach v_key in array p_keys loop
    v_value := nullif(regexp_replace(coalesce(p_row ->> v_key, ''), '[^0-9.\-]', '', 'g'), '');
    if v_value is not null and v_value ~ '^-?[0-9]+(\.[0-9]+)?$' then
      v_number := v_value::numeric;
      if v_key ilike '%cents' then
        return v_number / 100;
      end if;
      return v_number;
    end if;
  end loop;

  return coalesce(p_default, 0);
end;
$$;

create or replace function public.arch9_admin_json_has_value(
  p_row jsonb,
  p_keys text[]
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_key text;
begin
  foreach v_key in array p_keys loop
    if p_row ? v_key and nullif(trim(coalesce(p_row ->> v_key, '')), '') is not null then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function public.arch9_admin_json_timestamp(
  p_row jsonb,
  p_keys text[]
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_key text;
  v_value text;
begin
  foreach v_key in array p_keys loop
    v_value := nullif(trim(coalesce(p_row ->> v_key, '')), '');
    if v_value is not null then
      begin
        return v_value::timestamptz;
      exception when others then
        null;
      end;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.arch9_admin_table_rows(
  p_table regclass,
  p_limit integer default 5000
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 5000), 10000));
begin
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(row_data)), ''[]''::jsonb) from (select * from %s limit %s) row_data',
    p_table,
    v_limit
  )
  into v_rows;

  return coalesce(v_rows, '[]'::jsonb);
exception when others then
  return '[]'::jsonb;
end;
$$;

create or replace function public.arch9_admin_jwt_role_tokens()
returns text[]
language sql
stable
security invoker
set search_path = public
as $$
  with claims as (
    select coalesce(auth.jwt(), '{}'::jsonb) as jwt
  ),
  scalar_tokens as (
    select public.arch9_admin_normalize_token(value) as token
    from claims,
    lateral (
      values
        (jwt #>> '{app_metadata,role}'),
        (jwt #>> '{app_metadata,app_role}'),
        (jwt #>> '{app_metadata,system_role}'),
        (jwt #>> '{user_metadata,role}'),
        (jwt #>> '{user_metadata,app_role}'),
        (jwt #>> '{user_metadata,system_role}')
    ) as tokens(value)
  ),
  array_tokens as (
    select public.arch9_admin_normalize_token(value) as token
    from claims,
    lateral jsonb_array_elements_text(coalesce(jwt #> '{app_metadata,roles}', '[]'::jsonb)) as roles(value)
    union all
    select public.arch9_admin_normalize_token(value) as token
    from claims,
    lateral jsonb_array_elements_text(coalesce(jwt #> '{app_metadata,permissions}', '[]'::jsonb)) as permissions(value)
    union all
    select public.arch9_admin_normalize_token(value) as token
    from claims,
    lateral jsonb_array_elements_text(coalesce(jwt #> '{user_metadata,roles}', '[]'::jsonb)) as roles(value)
    union all
    select public.arch9_admin_normalize_token(value) as token
    from claims,
    lateral jsonb_array_elements_text(coalesce(jwt #> '{user_metadata,permissions}', '[]'::jsonb)) as permissions(value)
  )
  select coalesce(array_agg(distinct token) filter (where token <> ''), array[]::text[])
  from (
    select token from scalar_tokens
    union all
    select token from array_tokens
  ) collected;
$$;

create or replace function public.arch9_admin_can_access_dashboard()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select auth.uid() is not null
    and public.arch9_admin_jwt_role_tokens() && array[
      'executive',
      'executive_level',
      'founder',
      'super_admin',
      'platform_admin',
      'internal_admin',
      'developer',
      'hq_staff',
      'admin',
      'customer_support',
      'customer_support_level',
      'support_agent'
    ]::text[];
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
  v_listings jsonb := '[]'::jsonb;
  v_transactions jsonb := '[]'::jsonb;
  v_row jsonb;
  v_status text;
  v_role text;
  v_stage text;
  v_signed_seller boolean;
  v_signed_buyer boolean;
  v_registered boolean;
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
  v_active_organisation_rows jsonb := '[]'::jsonb;
  v_active_agent_rows jsonb := '[]'::jsonb;
  v_active_listing_rows jsonb := '[]'::jsonb;
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

  if to_regclass('public.private_listings') is not null then
    v_listings := public.arch9_admin_table_rows(to_regclass('public.private_listings'));
  else
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('table', 'private_listings', 'message', 'table missing'));
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
    v_role := public.arch9_admin_normalize_token(public.arch9_admin_json_text(v_row, array['role', 'app_role', 'system_role', 'workspace_role', 'organisation_role', 'organization_role', 'portal_role'], ''));
    v_status := public.arch9_admin_normalize_token(public.arch9_admin_json_text(v_row, array['status', 'profile_status', 'is_active'], 'active'));
    if v_role like '%agent%'
      and v_status not in ('inactive', 'archived', 'deleted', 'suspended', 'disabled', 'false')
    then
      v_active_agents := v_active_agents + 1;
      if jsonb_array_length(v_active_agent_rows) < 50 then
        v_active_agent_rows := v_active_agent_rows || jsonb_build_array(jsonb_build_object(
          'id', v_row ->> 'id',
          'name', public.arch9_admin_json_text(v_row, array['full_name', 'name', 'display_name'], 'Agent'),
          'email', public.arch9_admin_json_text(v_row, array['email', 'email_address'], ''),
          'phone', public.arch9_admin_json_text(v_row, array['phone', 'mobile', 'cellphone'], ''),
          'role', coalesce(nullif(v_role, ''), 'agent'),
          'status', coalesce(nullif(v_status, ''), 'active'),
          'organisationId', public.arch9_admin_json_text(v_row, array['organisation_id', 'organization_id', 'agency_id', 'company_id'], ''),
          'createdAt', public.arch9_admin_json_timestamp(v_row, array['created_at', 'inserted_at']),
          'updatedAt', public.arch9_admin_json_timestamp(v_row, array['last_activity_at', 'updated_at', 'created_at'])
        ));
      end if;
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(v_listings) loop
    v_status := public.arch9_admin_normalize_token(
      public.arch9_admin_json_text(v_row, array['bridge_listing_status', 'listing_status', 'status', 'publication_status', 'marketing_status', 'is_active'], 'active')
    );
    if v_status not in ('sold', 'registered', 'archived', 'withdrawn', 'deleted', 'inactive', 'disabled', 'not_published', 'draft', 'false') then
      v_active_listings := v_active_listings + 1;
      if jsonb_array_length(v_active_listing_rows) < 50 then
        v_active_listing_rows := v_active_listing_rows || jsonb_build_array(jsonb_build_object(
          'id', v_row ->> 'id',
          'reference', public.arch9_admin_json_text(v_row, array['reference', 'listing_reference', 'code', 'id'], 'Listing'),
          'title', public.arch9_admin_json_text(v_row, array['title', 'property_title', 'name', 'reference'], 'Listing'),
          'location', public.arch9_admin_json_text(v_row, array['location', 'suburb', 'city', 'area'], ''),
          'address', public.arch9_admin_json_text(v_row, array['address', 'property_address'], ''),
          'status', coalesce(nullif(v_status, ''), 'active'),
          'organisationId', public.arch9_admin_json_text(v_row, array['organisation_id', 'organization_id', 'agency_id', 'company_id'], ''),
          'agentId', public.arch9_admin_json_text(v_row, array['assigned_agent_id', 'agent_id', 'owner_user_id'], ''),
          'price', public.arch9_admin_json_number(v_row, array['price', 'asking_price', 'listing_price', 'purchase_price'], 0),
          'createdAt', public.arch9_admin_json_timestamp(v_row, array['created_at', 'inserted_at']),
          'updatedAt', public.arch9_admin_json_timestamp(v_row, array['updated_at', 'last_activity_at', 'created_at'])
        ));
      end if;
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(v_transactions) loop
    v_status := public.arch9_admin_normalize_token(public.arch9_admin_json_text(v_row, array['status', 'workflow_status', 'lifecycle_state', 'matter_status'], ''));
    v_stage := public.arch9_admin_normalize_token(public.arch9_admin_json_text(v_row, array['stage', 'transaction_stage', 'matter_stage', 'onboarding_status'], ''));
    v_registration_at := public.arch9_admin_json_timestamp(v_row, array['registration_date', 'registered_at', 'date_registered', 'transfer_registered_at']);
    v_last_activity_at := public.arch9_admin_json_timestamp(v_row, array['last_activity_at', 'updated_at', 'created_at']);
    v_revenue_present := public.arch9_admin_json_has_value(v_row, v_operating_revenue_keys);
    v_revenue := case
      when v_revenue_present then public.arch9_admin_json_number(v_row, v_operating_revenue_keys, 0)
      else 0
    end;
    v_registered := v_registration_at is not null
      or v_status like '%registered%'
      or v_stage like '%registered%';
    v_signed_seller := public.arch9_admin_json_timestamp(v_row, array['seller_signed_at', 'seller_signature_at', 'seller_otp_signed_at', 'mandate_signed_at']) is not null
      or v_status like '%seller_signed%'
      or v_stage like '%seller_signed%'
      or v_status like '%signed_seller%'
      or v_stage like '%signed_seller%';
    v_signed_buyer := public.arch9_admin_json_timestamp(v_row, array['buyer_signed_at', 'buyer_signature_at', 'buyer_otp_signed_at', 'otp_signed_date', 'offer_signed_at', 'signed_at']) is not null
      or v_status like '%buyer_signed%'
      or v_stage like '%buyer_signed%'
      or v_status like '%signed_buyer%'
      or v_stage like '%signed_buyer%'
      or v_stage like '%otp_signed%'
      or v_status like '%otp_signed%';

    if v_signed_seller and v_signed_buyer and not v_registered then
      v_pipeline_count := v_pipeline_count + 1;
      v_pipeline_revenue := v_pipeline_revenue + v_revenue;
      if jsonb_array_length(v_pipeline_rows) < 25 then
        v_pipeline_rows := v_pipeline_rows || jsonb_build_array(jsonb_build_object(
          'id', v_row ->> 'id',
          'reference', public.arch9_admin_json_text(v_row, array['reference', 'matter_number', 'transaction_reference', 'id'], 'Transaction'),
          'organisationId', public.arch9_admin_json_text(v_row, array['organisation_id', 'organization_id', 'agency_id', 'company_id'], ''),
          'agentId', public.arch9_admin_json_text(v_row, array['assigned_agent_id', 'agent_id', 'owner_user_id'], ''),
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
          'agentId', public.arch9_admin_json_text(v_row, array['assigned_agent_id', 'agent_id', 'owner_user_id'], ''),
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
      and v_status not in ('cancelled', 'canceled', 'closed', 'complete', 'completed', 'lost', 'deleted', 'archived')
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
      'activeListings', v_active_listing_rows
    ),
    'pipeline', v_pipeline_rows,
    'registered', v_registered_rows,
    'attention', v_attention_rows,
    'warnings', v_warnings
  );
end;
$$;

create or replace function public.arch9_admin_support_snapshot(
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
  v_tickets jsonb := '[]'::jsonb;
  v_transactions jsonb := '[]'::jsonb;
  v_row jsonb;
  v_status text;
  v_priority text;
  v_stage text;
  v_signed_seller boolean;
  v_signed_buyer boolean;
  v_registered boolean;
  v_registration_at timestamptz;
  v_last_activity_at timestamptz;
  v_revenue_present boolean;
  v_operating_revenue_keys text[] := array[
    'arch9_revenue_amount',
    'platform_fee_amount',
    'platform_fee',
    'transaction_fee',
    'fee_amount',
    'revenue_amount'
  ];
  v_open_tickets integer := 0;
  v_urgent_tickets integer := 0;
  v_missing_revenue_items integer := 0;
  v_stalled_transactions integer := 0;
  v_queue jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  if v_end < v_start then
    raise exception 'range end must be greater than or equal to range start' using errcode = '22023';
  end if;

  if not public.arch9_admin_can_access_dashboard() then
    raise exception 'admin support access required' using errcode = '42501';
  end if;

  if to_regclass('public.support_tickets') is not null then
    v_tickets := public.arch9_admin_table_rows(to_regclass('public.support_tickets'));
  else
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('table', 'support_tickets', 'message', 'table missing'));
  end if;

  if to_regclass('public.transactions') is not null then
    v_transactions := public.arch9_admin_table_rows(to_regclass('public.transactions'));
  else
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('table', 'transactions', 'message', 'table missing'));
  end if;

  for v_row in select value from jsonb_array_elements(v_tickets) loop
    v_status := public.arch9_admin_normalize_token(public.arch9_admin_json_text(v_row, array['status', 'ticket_status'], 'open'));
    v_priority := public.arch9_admin_normalize_token(public.arch9_admin_json_text(v_row, array['priority', 'severity'], 'normal'));
    v_last_activity_at := public.arch9_admin_json_timestamp(v_row, array['last_activity_at', 'updated_at', 'created_at']);

    if v_status not in ('closed', 'resolved', 'done', 'complete', 'completed', 'deleted', 'archived') then
      v_open_tickets := v_open_tickets + 1;
      if v_priority in ('urgent', 'critical', 'high', 'p0', 'p1') then
        v_urgent_tickets := v_urgent_tickets + 1;
      end if;
      if jsonb_array_length(v_queue) < 50 then
        v_queue := v_queue || jsonb_build_array(jsonb_build_object(
          'type', 'support_ticket',
          'priority', v_priority,
          'id', v_row ->> 'id',
          'title', public.arch9_admin_json_text(v_row, array['title', 'subject', 'summary'], 'Support ticket'),
          'organisationId', public.arch9_admin_json_text(v_row, array['organisation_id', 'organization_id', 'company_id'], ''),
          'ownerId', public.arch9_admin_json_text(v_row, array['assigned_to', 'owner_user_id', 'assignee_id'], ''),
          'status', v_status,
          'lastActivityAt', v_last_activity_at,
          'suggestedAction', 'Review support ticket and update owner/status.'
        ));
      end if;
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(v_transactions) loop
    v_status := public.arch9_admin_normalize_token(public.arch9_admin_json_text(v_row, array['status', 'workflow_status', 'lifecycle_state', 'matter_status'], ''));
    v_stage := public.arch9_admin_normalize_token(public.arch9_admin_json_text(v_row, array['stage', 'transaction_stage', 'matter_stage', 'onboarding_status'], ''));
    v_registration_at := public.arch9_admin_json_timestamp(v_row, array['registration_date', 'registered_at', 'date_registered', 'transfer_registered_at']);
    v_last_activity_at := public.arch9_admin_json_timestamp(v_row, array['last_activity_at', 'updated_at', 'created_at']);
    v_revenue_present := public.arch9_admin_json_has_value(v_row, v_operating_revenue_keys);
    v_registered := v_registration_at is not null
      or v_status like '%registered%'
      or v_stage like '%registered%';
    v_signed_seller := public.arch9_admin_json_timestamp(v_row, array['seller_signed_at', 'seller_signature_at', 'seller_otp_signed_at', 'mandate_signed_at']) is not null
      or v_status like '%seller_signed%'
      or v_stage like '%seller_signed%'
      or v_status like '%signed_seller%'
      or v_stage like '%signed_seller%';
    v_signed_buyer := public.arch9_admin_json_timestamp(v_row, array['buyer_signed_at', 'buyer_signature_at', 'buyer_otp_signed_at', 'otp_signed_date', 'offer_signed_at', 'signed_at']) is not null
      or v_status like '%buyer_signed%'
      or v_stage like '%buyer_signed%'
      or v_status like '%signed_buyer%'
      or v_stage like '%signed_buyer%'
      or v_stage like '%otp_signed%'
      or v_status like '%otp_signed%';

    if not v_revenue_present
      and (
        (v_signed_seller and v_signed_buyer and not v_registered)
        or (
          v_registered
          and coalesce(v_registration_at, v_last_activity_at, now()) >= v_start
          and coalesce(v_registration_at, v_last_activity_at, now()) <= v_end
        )
      )
    then
      v_missing_revenue_items := v_missing_revenue_items + 1;
      if jsonb_array_length(v_queue) < 50 then
        v_queue := v_queue || jsonb_build_array(jsonb_build_object(
          'type', 'missing_revenue',
          'priority', 'high',
          'id', v_row ->> 'id',
          'title', public.arch9_admin_json_text(v_row, array['reference', 'matter_number', 'transaction_reference', 'id'], 'Transaction'),
          'organisationId', public.arch9_admin_json_text(v_row, array['organisation_id', 'organization_id', 'agency_id', 'company_id'], ''),
          'ownerId', public.arch9_admin_json_text(v_row, array['assigned_agent_id', 'agent_id', 'owner_user_id'], ''),
          'status', case when v_registered then 'registered_missing_revenue' else 'signed_pipeline_missing_revenue' end,
          'lastActivityAt', coalesce(v_registration_at, v_last_activity_at),
          'suggestedAction', 'Add the Arch9 operating revenue amount before this item is used in reporting.'
        ));
      end if;
    end if;

    if not v_registered
      and v_status not in ('cancelled', 'canceled', 'closed', 'complete', 'completed', 'lost', 'deleted', 'archived')
      and v_stage not in ('cancelled', 'canceled', 'closed', 'complete', 'completed', 'lost', 'deleted', 'archived')
      and v_last_activity_at is not null
      and v_last_activity_at < now() - interval '14 days'
    then
      v_stalled_transactions := v_stalled_transactions + 1;
      if jsonb_array_length(v_queue) < 50 then
        v_queue := v_queue || jsonb_build_array(jsonb_build_object(
          'type', 'stalled_transaction',
          'priority', case when v_last_activity_at < now() - interval '30 days' then 'high' else 'medium' end,
          'id', v_row ->> 'id',
          'title', public.arch9_admin_json_text(v_row, array['reference', 'matter_number', 'transaction_reference', 'id'], 'Transaction'),
          'organisationId', public.arch9_admin_json_text(v_row, array['organisation_id', 'organization_id', 'agency_id', 'company_id'], ''),
          'ownerId', public.arch9_admin_json_text(v_row, array['assigned_agent_id', 'agent_id', 'owner_user_id'], ''),
          'status', coalesce(nullif(v_stage, ''), v_status),
          'lastActivityAt', v_last_activity_at,
          'suggestedAction', 'Review stalled transaction and assign a follow-up owner.'
        ));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'generatedAt', now(),
    'range', jsonb_build_object('start', v_start, 'end', v_end),
    'summary', jsonb_build_object(
      'openTickets', v_open_tickets,
      'urgentTickets', v_urgent_tickets,
      'missingRevenueItems', v_missing_revenue_items,
      'stalledTransactions', v_stalled_transactions,
      'totalItems', jsonb_array_length(v_queue)
    ),
    'queue', v_queue,
    'warnings', v_warnings
  );
end;
$$;

grant execute on function public.arch9_admin_normalize_token(text) to authenticated;
grant execute on function public.arch9_admin_json_text(jsonb, text[], text) to authenticated;
grant execute on function public.arch9_admin_json_number(jsonb, text[], numeric) to authenticated;
grant execute on function public.arch9_admin_json_has_value(jsonb, text[]) to authenticated;
grant execute on function public.arch9_admin_json_timestamp(jsonb, text[]) to authenticated;
grant execute on function public.arch9_admin_table_rows(regclass, integer) to authenticated;
grant execute on function public.arch9_admin_jwt_role_tokens() to authenticated;
grant execute on function public.arch9_admin_can_access_dashboard() to authenticated;
grant execute on function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz) to authenticated;
grant execute on function public.arch9_admin_support_snapshot(timestamptz, timestamptz) to authenticated;

comment on function public.arch9_admin_dashboard_snapshot(timestamptz, timestamptz)
  is 'Admin portal V1 dashboard contract: active orgs, active agents, active listings, pipeline revenue, registered revenue, and attention rows.';

comment on function public.arch9_admin_support_snapshot(timestamptz, timestamptz)
  is 'Admin portal V1 support contract: open tickets and stalled transaction queue.';
