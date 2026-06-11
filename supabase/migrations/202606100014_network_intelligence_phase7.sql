create extension if not exists "pgcrypto";

create table if not exists public.network_referral_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  source_organization_id uuid not null references public.organisations(id) on delete cascade,
  target_organization_id uuid not null references public.organisations(id) on delete cascade,
  relationship_type text not null default 'other',
  role_type text not null default 'other',
  partner_prospect_id uuid references public.partner_prospects(id) on delete set null,
  referral_source_organization_id uuid references public.organisations(id) on delete set null,
  transaction_value numeric(14, 2) not null default 0,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint network_referral_events_not_self check (source_organization_id <> target_organization_id)
);

create unique index if not exists network_referral_events_transaction_pair_role_uidx
  on public.network_referral_events (
    transaction_id,
    source_organization_id,
    target_organization_id,
    coalesce(role_type, 'other')
  );
create index if not exists network_referral_events_source_idx
  on public.network_referral_events (source_organization_id, occurred_at desc);
create index if not exists network_referral_events_target_idx
  on public.network_referral_events (target_organization_id, occurred_at desc);
create index if not exists network_referral_events_prospect_idx
  on public.network_referral_events (partner_prospect_id)
  where partner_prospect_id is not null;

create table if not exists public.organization_relationship_metrics (
  id uuid primary key default gen_random_uuid(),
  source_organization_id uuid not null references public.organisations(id) on delete cascade,
  target_organization_id uuid not null references public.organisations(id) on delete cascade,
  relationship_type text not null default 'other',
  transaction_count integer not null default 0,
  active_transaction_count integer not null default 0,
  completed_transaction_count integer not null default 0,
  completion_rate numeric(8, 4) not null default 0,
  average_cycle_time numeric(10, 2),
  average_response_time numeric(10, 2),
  referral_volume numeric(14, 2) not null default 0,
  relationship_health_score integer not null default 0,
  first_transaction_date timestamptz,
  last_transaction_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_relationship_metrics_not_self check (source_organization_id <> target_organization_id),
  constraint organization_relationship_metrics_score_check check (relationship_health_score between 0 and 100)
);

create unique index if not exists organization_relationship_metrics_pair_type_uidx
  on public.organization_relationship_metrics (source_organization_id, target_organization_id, relationship_type);
create index if not exists organization_relationship_metrics_source_idx
  on public.organization_relationship_metrics (source_organization_id, relationship_health_score desc, transaction_count desc);
create index if not exists organization_relationship_metrics_target_idx
  on public.organization_relationship_metrics (target_organization_id, relationship_health_score desc, transaction_count desc);

create table if not exists public.network_partner_opportunities (
  id uuid primary key default gen_random_uuid(),
  partner_prospect_id uuid references public.partner_prospects(id) on delete set null,
  role_type text not null default 'other',
  company_name text not null,
  company_key text not null,
  status text not null default 'pending',
  transactions_waiting integer not null default 0,
  agencies_count integer not null default 0,
  invitation_count integer not null default 0,
  accepted_invitation_count integer not null default 0,
  conversion_rate numeric(8, 4) not null default 0,
  opportunity_score integer not null default 0,
  last_selected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint network_partner_opportunities_score_check check (opportunity_score between 0 and 100)
);

create unique index if not exists network_partner_opportunities_role_company_uidx
  on public.network_partner_opportunities (role_type, company_key);
create index if not exists network_partner_opportunities_score_idx
  on public.network_partner_opportunities (opportunity_score desc, transactions_waiting desc);

create table if not exists public.network_relationship_events (
  id uuid primary key default gen_random_uuid(),
  source_organization_id uuid references public.organisations(id) on delete cascade,
  target_organization_id uuid references public.organisations(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists network_relationship_events_source_idx
  on public.network_relationship_events (source_organization_id, created_at desc);
create index if not exists network_relationship_events_target_idx
  on public.network_relationship_events (target_organization_id, created_at desc);

create or replace function public.bridge_phase7_is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = p_organization_id
      and ou.user_id = auth.uid()
      and coalesce(ou.membership_status, ou.status) = 'active'
  )
$$;

create or replace function public.bridge_phase7_is_bridge_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_claim_role text := lower(coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''));
begin
  return v_claim_role in ('service_role', 'supabase_admin');
exception
  when others then
    return false;
end;
$$;

create or replace function public.bridge_phase7_relationship_health_score(
  p_transaction_count integer,
  p_active_count integer,
  p_completed_count integer,
  p_average_cycle_time numeric,
  p_average_response_time numeric,
  p_last_transaction_date timestamptz
)
returns integer
language plpgsql
stable
as $$
declare
  v_score numeric := 0;
begin
  v_score := v_score + least(coalesce(p_transaction_count, 0), 50);
  if coalesce(p_transaction_count, 0) > 0 then
    v_score := v_score + (coalesce(p_completed_count, 0)::numeric / greatest(p_transaction_count, 1)) * 25;
  end if;
  v_score := v_score + least(coalesce(p_active_count, 0) * 2, 10);
  if p_average_cycle_time is not null then
    v_score := v_score + case
      when p_average_cycle_time <= 45 then 10
      when p_average_cycle_time <= 75 then 6
      when p_average_cycle_time <= 110 then 3
      else 0
    end;
  end if;
  if p_average_response_time is not null then
    v_score := v_score + case
      when p_average_response_time <= 4 then 5
      when p_average_response_time <= 24 then 3
      when p_average_response_time <= 72 then 1
      else 0
    end;
  end if;
  if p_last_transaction_date is not null and p_last_transaction_date >= now() - interval '90 days' then
    v_score := v_score + 10;
  end if;

  return greatest(0, least(100, round(v_score)::integer));
end;
$$;

create or replace function public.bridge_phase7_normalize_partner_role(p_role_type text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_role_type, '')) in ('transfer_attorney', 'bond_attorney', 'attorney', 'conveyancer', 'cancellation_attorney') then 'attorney'
    when lower(coalesce(p_role_type, '')) in ('bond_originator', 'originator', 'bond_consultant') then 'bond_originator'
    when lower(coalesce(p_role_type, '')) in ('developer', 'developer_contact') then 'developer'
    when lower(coalesce(p_role_type, '')) = 'agent' then 'agency'
    else 'other'
  end
$$;

create or replace function public.bridge_phase7_upsert_referral_event(
  p_transaction_id uuid,
  p_source_organization_id uuid,
  p_target_organization_id uuid,
  p_role_type text default 'other',
  p_partner_prospect_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_relationship_type text := 'other';
  v_transaction public.transactions%rowtype;
begin
  if p_transaction_id is null
     or p_source_organization_id is null
     or p_target_organization_id is null
     or p_source_organization_id = p_target_organization_id then
    return null;
  end if;

  select *
  into v_transaction
  from public.transactions
  where id = p_transaction_id;

  if v_transaction.id is null then
    return null;
  end if;

  v_relationship_type := coalesce(public.bridge_phase4_relationship_type(p_source_organization_id, p_target_organization_id), 'other');

  insert into public.network_referral_events (
    transaction_id,
    source_organization_id,
    target_organization_id,
    relationship_type,
    role_type,
    partner_prospect_id,
    referral_source_organization_id,
    transaction_value,
    occurred_at,
    metadata
  )
  values (
    p_transaction_id,
    p_source_organization_id,
    p_target_organization_id,
    v_relationship_type,
    coalesce(nullif(trim(p_role_type), ''), 'other'),
    p_partner_prospect_id,
    v_transaction.referral_source_organisation_id,
    coalesce(v_transaction.purchase_price, v_transaction.sales_price, v_transaction.bond_amount, v_transaction.cash_amount, 0),
    coalesce(v_transaction.created_at, now()),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict do nothing
  returning id into v_event_id;

  if v_event_id is not null then
    insert into public.network_relationship_events (
      source_organization_id,
      target_organization_id,
      transaction_id,
      event_type,
      event_data
    )
    values (
      p_source_organization_id,
      p_target_organization_id,
      p_transaction_id,
      'Referral Tracked',
      jsonb_build_object(
        'relationshipType', v_relationship_type,
        'roleType', coalesce(nullif(trim(p_role_type), ''), 'other'),
        'partnerProspectId', p_partner_prospect_id
      )
    );
  end if;

  return v_event_id;
end;
$$;

create or replace function public.bridge_phase7_refresh_network_metrics(p_organization_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metrics_count integer := 0;
  v_opportunities_count integer := 0;
begin
  if p_organization_id is null and not public.bridge_phase7_is_bridge_admin() then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if p_organization_id is not null and not public.bridge_phase7_is_org_member(p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  insert into public.network_referral_events (
    transaction_id,
    source_organization_id,
    target_organization_id,
    relationship_type,
    role_type,
    partner_prospect_id,
    referral_source_organization_id,
    transaction_value,
    occurred_at,
    metadata
  )
  select
    tx.id,
    tx.organisation_id,
    target.target_organization_id,
    public.bridge_phase4_relationship_type(tx.organisation_id, target.target_organization_id),
    coalesce(nullif(trim(trp.role_type), ''), 'other'),
    trp.partner_prospect_id,
    tx.referral_source_organisation_id,
    coalesce(tx.purchase_price, tx.sales_price, tx.bond_amount, tx.cash_amount, 0),
    coalesce(tx.created_at, now()),
    jsonb_build_object('source', 'transaction_role_players', 'roleplayerId', trp.id)
  from public.transactions tx
  join public.transaction_role_players trp on trp.transaction_id = tx.id
  cross join lateral (
    select coalesce(trp.partner_organisation_id, trp.assigned_organisation_id, trp.organisation_id) as target_organization_id
  ) target
  where tx.organisation_id is not null
    and target.target_organization_id is not null
    and tx.organisation_id <> target.target_organization_id
    and (p_organization_id is null or p_organization_id in (tx.organisation_id, target.target_organization_id))
  on conflict do nothing;

  insert into public.network_referral_events (
    transaction_id,
    source_organization_id,
    target_organization_id,
    relationship_type,
    role_type,
    referral_source_organization_id,
    transaction_value,
    occurred_at,
    metadata
  )
  select
    tx.id,
    tx.referral_source_organisation_id,
    tx.organisation_id,
    public.bridge_phase4_relationship_type(tx.referral_source_organisation_id, tx.organisation_id),
    'referral_source',
    tx.referral_source_organisation_id,
    coalesce(tx.purchase_price, tx.sales_price, tx.bond_amount, tx.cash_amount, 0),
    coalesce(tx.created_at, now()),
    jsonb_build_object('source', 'transaction_referral_source')
  from public.transactions tx
  where tx.referral_source_organisation_id is not null
    and tx.organisation_id is not null
    and tx.referral_source_organisation_id <> tx.organisation_id
    and (p_organization_id is null or p_organization_id in (tx.referral_source_organisation_id, tx.organisation_id))
  on conflict do nothing;

  delete from public.organization_relationship_metrics
  where p_organization_id is null
     or source_organization_id = p_organization_id
     or target_organization_id = p_organization_id;

  insert into public.organization_relationship_metrics (
    source_organization_id,
    target_organization_id,
    relationship_type,
    transaction_count,
    active_transaction_count,
    completed_transaction_count,
    completion_rate,
    average_cycle_time,
    average_response_time,
    referral_volume,
    relationship_health_score,
    first_transaction_date,
    last_transaction_date
  )
  select
    aggregates.source_organization_id,
    aggregates.target_organization_id,
    aggregates.relationship_type,
    aggregates.transaction_count,
    aggregates.active_transaction_count,
    aggregates.completed_transaction_count,
    aggregates.completion_rate,
    aggregates.average_cycle_time,
    aggregates.average_response_time,
    aggregates.referral_volume,
    public.bridge_phase7_relationship_health_score(
      aggregates.transaction_count,
      aggregates.active_transaction_count,
      aggregates.completed_transaction_count,
      aggregates.average_cycle_time,
      aggregates.average_response_time,
      aggregates.last_transaction_date
    ),
    aggregates.first_transaction_date,
    aggregates.last_transaction_date
  from (
    select
      nre.source_organization_id,
      nre.target_organization_id,
      nre.relationship_type,
      count(distinct nre.transaction_id)::integer as transaction_count,
      count(distinct nre.transaction_id) filter (
        where lower(coalesce(tx.stage, tx.current_main_stage, tx.status, '')) not in ('reg', 'registered', 'completed', 'complete', 'cancelled', 'archived')
          and tx.completed_at is null
      )::integer as active_transaction_count,
      count(distinct nre.transaction_id) filter (
        where lower(coalesce(tx.stage, tx.current_main_stage, tx.status, '')) in ('reg', 'registered', 'completed', 'complete')
          or tx.completed_at is not null
          or tx.registered_at is not null
      )::integer as completed_transaction_count,
      round(
        count(distinct nre.transaction_id) filter (
          where lower(coalesce(tx.stage, tx.current_main_stage, tx.status, '')) in ('reg', 'registered', 'completed', 'complete')
            or tx.completed_at is not null
            or tx.registered_at is not null
        )::numeric / greatest(count(distinct nre.transaction_id), 1),
        4
      ) as completion_rate,
      round((avg(extract(epoch from (coalesce(tx.completed_at, tx.registered_at) - tx.created_at)) / 86400) filter (
        where coalesce(tx.completed_at, tx.registered_at) is not null
      ))::numeric, 2) as average_cycle_time,
      round((avg(extract(epoch from (assignment.first_assignment_at - tx.created_at)) / 3600) filter (
        where assignment.first_assignment_at is not null
      ))::numeric, 2) as average_response_time,
      coalesce(sum(nre.transaction_value), 0)::numeric(14, 2) as referral_volume,
      min(tx.created_at) as first_transaction_date,
      max(coalesce(tx.completed_at, tx.registered_at, tx.updated_at, tx.created_at)) as last_transaction_date
    from public.network_referral_events nre
    join public.transactions tx on tx.id = nre.transaction_id
    left join lateral (
      select min(ae.created_at) as first_assignment_at
      from public.assignment_events ae
      where ae.transaction_id = tx.id
        and ae.event_type in ('assigned', 'reassigned')
    ) assignment on true
    where p_organization_id is null
       or p_organization_id in (nre.source_organization_id, nre.target_organization_id)
    group by nre.source_organization_id, nre.target_organization_id, nre.relationship_type
  ) aggregates
  on conflict (source_organization_id, target_organization_id, relationship_type) do update
  set transaction_count = excluded.transaction_count,
      active_transaction_count = excluded.active_transaction_count,
      completed_transaction_count = excluded.completed_transaction_count,
      completion_rate = excluded.completion_rate,
      average_cycle_time = excluded.average_cycle_time,
      average_response_time = excluded.average_response_time,
      referral_volume = excluded.referral_volume,
      relationship_health_score = excluded.relationship_health_score,
      first_transaction_date = excluded.first_transaction_date,
      last_transaction_date = excluded.last_transaction_date,
      updated_at = now();

  get diagnostics v_metrics_count = row_count;

  delete from public.network_partner_opportunities;

  insert into public.network_partner_opportunities (
    partner_prospect_id,
    role_type,
    company_name,
    company_key,
    status,
    transactions_waiting,
    agencies_count,
    invitation_count,
    accepted_invitation_count,
    conversion_rate,
    opportunity_score,
    last_selected_at,
    metadata
  )
  select
    pp.id,
    pp.role_type,
    pp.company_name,
    pp.company_key,
    case when pp.status in ('joined', 'connected') then 'converted' else 'pending' end,
    greatest(coalesce(pp.transaction_count, 0) - coalesce(pp.accepted_invitation_count, 0), 0),
    coalesce(usage.agencies_count, 0),
    coalesce(pp.invitation_count, 0),
    coalesce(pp.accepted_invitation_count, 0),
    round(coalesce(pp.accepted_invitation_count, 0)::numeric / greatest(coalesce(pp.invitation_count, 0), 1), 4),
    greatest(0, least(100, (
      greatest(coalesce(pp.transaction_count, 0) - coalesce(pp.accepted_invitation_count, 0), 0) * 8
      + coalesce(pp.invitation_count, 0) * 4
      + coalesce(usage.agencies_count, 0) * 6
    )))::integer,
    pp.last_transaction_date,
    jsonb_build_object(
      'contactName', pp.contact_name,
      'email', pp.email,
      'phone', pp.phone,
      'prospectStatus', pp.status
    )
  from public.partner_prospects pp
  left join lateral (
    select count(distinct nre.source_organization_id)::integer as agencies_count
    from public.network_referral_events nre
    where nre.partner_prospect_id = pp.id
  ) usage on true
  where coalesce(pp.status, 'invited') not in ('connected')
    and (coalesce(pp.transaction_count, 0) > 0 or coalesce(pp.invitation_count, 0) > 0);

  get diagnostics v_opportunities_count = row_count;

  return jsonb_build_object(
    'success', true,
    'metricsUpdated', v_metrics_count,
    'opportunitiesUpdated', v_opportunities_count
  );
end;
$$;

create or replace function public.bridge_phase7_get_network_intelligence(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationships jsonb := '[]'::jsonb;
  v_referrers jsonb := '[]'::jsonb;
  v_partners jsonb := '[]'::jsonb;
  v_suggestions jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if p_organization_id is null or not public.bridge_phase7_is_org_member(p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  perform public.bridge_phase7_refresh_network_metrics(p_organization_id);

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.relationship_health_score desc, row_data.transaction_count desc, row_data.partner_name), '[]'::jsonb)
  into v_relationships
  from (
    select
      orm.id,
      orm.source_organization_id,
      orm.target_organization_id,
      orm.relationship_type,
      case when orm.source_organization_id = p_organization_id then 'outgoing' else 'incoming' end as direction,
      partner.id as partner_organization_id,
      partner.name as partner_name,
      partner.display_name as partner_display_name,
      coalesce(partner.organization_type, partner.type) as partner_organization_type,
      partner.organization_subtype as partner_organization_subtype,
      orm.transaction_count,
      orm.active_transaction_count,
      orm.completed_transaction_count,
      orm.completion_rate,
      orm.average_cycle_time,
      orm.average_response_time,
      orm.referral_volume,
      orm.relationship_health_score,
      orm.first_transaction_date,
      orm.last_transaction_date
    from public.organization_relationship_metrics orm
    join public.organisations partner
      on partner.id = case when orm.source_organization_id = p_organization_id then orm.target_organization_id else orm.source_organization_id end
    where p_organization_id in (orm.source_organization_id, orm.target_organization_id)
    limit 50
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.transaction_count desc, row_data.organization_name), '[]'::jsonb)
  into v_referrers
  from (
    select
      o.id as organization_id,
      o.name as organization_name,
      o.display_name as organization_display_name,
      coalesce(o.organization_type, o.type) as organization_type,
      sum(orm.transaction_count)::integer as transaction_count,
      sum(orm.referral_volume)::numeric(14, 2) as referral_volume
    from public.organization_relationship_metrics orm
    join public.organisations o on o.id = orm.source_organization_id
    where orm.target_organization_id = p_organization_id
    group by o.id, o.name, o.display_name, o.organization_type, o.type
    limit 8
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.transaction_count desc, row_data.organization_name), '[]'::jsonb)
  into v_partners
  from (
    select
      o.id as organization_id,
      o.name as organization_name,
      o.display_name as organization_display_name,
      coalesce(o.organization_type, o.type) as organization_type,
      sum(orm.transaction_count)::integer as transaction_count,
      sum(orm.active_transaction_count)::integer as active_transaction_count,
      max(orm.relationship_health_score)::integer as relationship_health_score
    from public.organization_relationship_metrics orm
    join public.organisations o on o.id = orm.target_organization_id
    where orm.source_organization_id = p_organization_id
    group by o.id, o.name, o.display_name, o.organization_type, o.type
    limit 8
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.network_signal desc, row_data.name), '[]'::jsonb)
  into v_suggestions
  from (
    select
      o.id,
      o.name,
      o.display_name,
      coalesce(o.organization_type, o.type) as organization_type,
      o.organization_subtype,
      count(distinct orm.source_organization_id)::integer as network_signal,
      'Frequently selected in the Bridge network' as reason
    from public.organisations o
    join public.organization_relationship_metrics orm on orm.target_organization_id = o.id
    where o.id <> p_organization_id
      and coalesce(o.status, 'active') = 'active'
      and coalesce(o.discovery_visibility, 'public') <> 'hidden'
      and public.bridge_phase4_can_connect(p_organization_id, o.id)
      and not exists (
        select 1
        from public.partner_connections pc
        where pc.status in ('pending', 'connected', 'blocked')
          and (
            (pc.source_organization_id = p_organization_id and pc.target_organization_id = o.id)
            or (pc.source_organization_id = o.id and pc.target_organization_id = p_organization_id)
          )
      )
    group by o.id, o.name, o.display_name, o.organization_type, o.type, o.organization_subtype
    limit 6
  ) row_data;

  select jsonb_build_object(
    'networkSize', count(distinct partner_id),
    'connectedAgencies', count(distinct partner_id) filter (where partner_type = 'agency'),
    'connectedAttorneys', count(distinct partner_id) filter (where partner_type = 'attorney_firm'),
    'connectedOriginators', count(distinct partner_id) filter (where partner_type = 'bond_originator'),
    'connectedDevelopers', count(distinct partner_id) filter (where partner_type = 'developer'),
    'transactionCount', coalesce(sum(transaction_count), 0),
    'activeTransactionCount', coalesce(sum(active_transaction_count), 0),
    'completedTransactionCount', coalesce(sum(completed_transaction_count), 0),
    'referralVolume', coalesce(sum(referral_volume), 0),
    'averageCycleTime', round(avg(average_cycle_time) filter (where average_cycle_time is not null), 2),
    'averageResponseTime', round(avg(average_response_time) filter (where average_response_time is not null), 2),
    'averageRelationshipScore', round(avg(relationship_health_score), 0)
  )
  into v_summary
  from (
    select
      case when orm.source_organization_id = p_organization_id then orm.target_organization_id else orm.source_organization_id end as partner_id,
      public.bridge_phase3_normalize_organization_type(coalesce(o.organization_type, o.type)) as partner_type,
      orm.transaction_count,
      orm.active_transaction_count,
      orm.completed_transaction_count,
      orm.referral_volume,
      orm.average_cycle_time,
      orm.average_response_time,
      orm.relationship_health_score
    from public.organization_relationship_metrics orm
    join public.organisations o
      on o.id = case when orm.source_organization_id = p_organization_id then orm.target_organization_id else orm.source_organization_id end
    where p_organization_id in (orm.source_organization_id, orm.target_organization_id)
  ) summary_rows;

  return jsonb_build_object(
    'success', true,
    'summary', coalesce(v_summary, '{}'::jsonb),
    'relationships', v_relationships,
    'topReferrers', v_referrers,
    'mostUsedPartners', v_partners,
    'suggestions', v_suggestions
  );
end;
$$;

create or replace function public.bridge_phase7_get_growth_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opportunities jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if not public.bridge_phase7_is_bridge_admin() then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  perform public.bridge_phase7_refresh_network_metrics(null);

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.opportunity_score desc, row_data.transactions_waiting desc), '[]'::jsonb)
  into v_opportunities
  from (
    select *
    from public.network_partner_opportunities
    order by opportunity_score desc, transactions_waiting desc, company_name
    limit 50
  ) row_data;

  select jsonb_build_object(
    'pendingOpportunities', count(*) filter (where status = 'pending'),
    'convertedOpportunities', count(*) filter (where status = 'converted'),
    'transactionsWaiting', coalesce(sum(transactions_waiting), 0),
    'averageConversionRate', round(avg(conversion_rate), 4)
  )
  into v_summary
  from public.network_partner_opportunities;

  return jsonb_build_object(
    'success', true,
    'summary', coalesce(v_summary, '{}'::jsonb),
    'opportunities', v_opportunities
  );
end;
$$;

create or replace function public.bridge_phase7_track_roleplayer_network()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_organization_id uuid;
  v_target_organization_id uuid;
begin
  select organisation_id
  into v_source_organization_id
  from public.transactions
  where id = new.transaction_id;

  v_target_organization_id := coalesce(new.partner_organisation_id, new.assigned_organisation_id, new.organisation_id);

  perform public.bridge_phase7_upsert_referral_event(
    new.transaction_id,
    v_source_organization_id,
    v_target_organization_id,
    new.role_type,
    new.partner_prospect_id,
    jsonb_build_object('source', 'transaction_role_players_trigger', 'roleplayerId', new.id)
  );

  if v_source_organization_id is not null or v_target_organization_id is not null then
    perform public.bridge_phase7_refresh_network_metrics(coalesce(v_source_organization_id, v_target_organization_id));
  end if;

  return new;
end;
$$;

drop trigger if exists transaction_role_players_phase7_network_tracking on public.transaction_role_players;
create trigger transaction_role_players_phase7_network_tracking
after insert or update of partner_organisation_id, assigned_organisation_id, organisation_id, role_type, partner_prospect_id
on public.transaction_role_players
for each row execute function public.bridge_phase7_track_roleplayer_network();

alter table public.network_referral_events enable row level security;
alter table public.organization_relationship_metrics enable row level security;
alter table public.network_partner_opportunities enable row level security;
alter table public.network_relationship_events enable row level security;

drop policy if exists network_referral_events_org_scope on public.network_referral_events;
create policy network_referral_events_org_scope
on public.network_referral_events
for select
using (
  public.bridge_phase7_is_org_member(source_organization_id)
  or public.bridge_phase7_is_org_member(target_organization_id)
  or public.bridge_phase7_is_bridge_admin()
);

drop policy if exists organization_relationship_metrics_org_scope on public.organization_relationship_metrics;
create policy organization_relationship_metrics_org_scope
on public.organization_relationship_metrics
for select
using (
  public.bridge_phase7_is_org_member(source_organization_id)
  or public.bridge_phase7_is_org_member(target_organization_id)
  or public.bridge_phase7_is_bridge_admin()
);

drop policy if exists network_relationship_events_org_scope on public.network_relationship_events;
create policy network_relationship_events_org_scope
on public.network_relationship_events
for select
using (
  public.bridge_phase7_is_org_member(source_organization_id)
  or public.bridge_phase7_is_org_member(target_organization_id)
  or public.bridge_phase7_is_bridge_admin()
);

drop policy if exists network_partner_opportunities_admin_scope on public.network_partner_opportunities;
create policy network_partner_opportunities_admin_scope
on public.network_partner_opportunities
for select
using (public.bridge_phase7_is_bridge_admin());

grant select on public.network_referral_events to authenticated;
grant select on public.organization_relationship_metrics to authenticated;
grant select on public.network_relationship_events to authenticated;
grant select on public.network_partner_opportunities to authenticated;
grant execute on function public.bridge_phase7_get_network_intelligence(uuid) to authenticated;
grant execute on function public.bridge_phase7_get_growth_dashboard() to authenticated;
grant execute on function public.bridge_phase7_refresh_network_metrics(uuid) to authenticated;
