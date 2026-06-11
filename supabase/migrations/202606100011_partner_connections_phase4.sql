create extension if not exists "pgcrypto";

alter table if exists public.partner_prospects
  drop constraint if exists partner_prospects_status_check;
alter table if exists public.partner_prospects
  add constraint partner_prospects_status_check
  check (status in ('invited', 'joined', 'connected', 'declined', 'inactive'));

create table if not exists public.partner_connections (
  id uuid primary key default gen_random_uuid(),
  source_organization_id uuid not null references public.organisations(id) on delete cascade,
  target_organization_id uuid not null references public.organisations(id) on delete cascade,
  relationship_type text not null,
  status text not null default 'pending',
  source_preferred boolean not null default false,
  target_preferred boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  declined_by uuid references auth.users(id) on delete set null,
  blocked_by uuid references auth.users(id) on delete set null,
  removed_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  declined_at timestamptz,
  blocked_at timestamptz,
  removed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_connections_not_self check (source_organization_id <> target_organization_id),
  constraint partner_connections_status_check check (status in ('pending', 'connected', 'declined', 'blocked', 'removed')),
  constraint partner_connections_relationship_type_check check (
    relationship_type in (
      'agency_attorney',
      'agency_bond_originator',
      'agency_developer',
      'developer_attorney',
      'developer_bond_originator',
      'other'
    )
  )
);

create unique index if not exists partner_connections_directional_pair_uidx
  on public.partner_connections (source_organization_id, target_organization_id);
create index if not exists partner_connections_source_status_idx
  on public.partner_connections (source_organization_id, status, relationship_type);
create index if not exists partner_connections_target_status_idx
  on public.partner_connections (target_organization_id, status, relationship_type);

create or replace function public.bridge_phase4_touch_partner_connection()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists partner_connections_updated_at on public.partner_connections;
create trigger partner_connections_updated_at
before update on public.partner_connections
for each row execute function public.bridge_phase4_touch_partner_connection();

create or replace function public.bridge_phase4_organization_type(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_phase3_normalize_organization_type(coalesce(o.organization_type, o.type))
  from public.organisations o
  where o.id = p_organization_id
$$;

create or replace function public.bridge_phase4_relationship_type(
  p_source_organization_id uuid,
  p_target_organization_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_source_type text := public.bridge_phase4_organization_type(p_source_organization_id);
  v_target_type text := public.bridge_phase4_organization_type(p_target_organization_id);
begin
  if v_source_type = 'agency' and v_target_type = 'attorney_firm' then
    return 'agency_attorney';
  elsif v_source_type = 'attorney_firm' and v_target_type = 'agency' then
    return 'agency_attorney';
  elsif v_source_type = 'agency' and v_target_type = 'bond_originator' then
    return 'agency_bond_originator';
  elsif v_source_type = 'bond_originator' and v_target_type = 'agency' then
    return 'agency_bond_originator';
  elsif v_source_type = 'agency' and v_target_type = 'developer' then
    return 'agency_developer';
  elsif v_source_type = 'developer' and v_target_type = 'agency' then
    return 'agency_developer';
  elsif v_source_type = 'developer' and v_target_type = 'attorney_firm' then
    return 'developer_attorney';
  elsif v_source_type = 'attorney_firm' and v_target_type = 'developer' then
    return 'developer_attorney';
  elsif v_source_type = 'developer' and v_target_type = 'bond_originator' then
    return 'developer_bond_originator';
  elsif v_source_type = 'bond_originator' and v_target_type = 'developer' then
    return 'developer_bond_originator';
  end if;

  return 'other';
end;
$$;

create or replace function public.bridge_phase4_can_connect(
  p_source_organization_id uuid,
  p_target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_source_organization_id is not null
    and p_target_organization_id is not null
    and p_source_organization_id <> p_target_organization_id
    and public.bridge_phase4_relationship_type(p_source_organization_id, p_target_organization_id) <> 'other'
$$;

create or replace function public.bridge_phase4_partner_role_type(p_organization_type text)
returns text
language sql
immutable
as $$
  select case public.bridge_phase3_normalize_organization_type(p_organization_type)
    when 'attorney_firm' then 'attorney'
    when 'bond_originator' then 'bond_originator'
    when 'developer' then 'developer'
    else 'other'
  end
$$;

create or replace function public.bridge_phase4_log_partner_connection_event(
  p_connection_id uuid,
  p_event_type text,
  p_actor_user_id uuid default null,
  p_event_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.partner_connections%rowtype;
begin
  select *
  into v_connection
  from public.partner_connections
  where id = p_connection_id;

  if v_connection.id is null then
    return;
  end if;

  perform public.bridge_phase3_log_organization_event(
    v_connection.source_organization_id,
    p_event_type,
    p_actor_user_id,
    null,
    null,
    null,
    jsonb_build_object('connectionId', v_connection.id, 'counterpartyOrganizationId', v_connection.target_organization_id) || coalesce(p_event_data, '{}'::jsonb)
  );

  perform public.bridge_phase3_log_organization_event(
    v_connection.target_organization_id,
    p_event_type,
    p_actor_user_id,
    null,
    null,
    null,
    jsonb_build_object('connectionId', v_connection.id, 'counterpartyOrganizationId', v_connection.source_organization_id) || coalesce(p_event_data, '{}'::jsonb)
  );
end;
$$;

create or replace function public.bridge_phase4_list_partner_connections(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rows jsonb := '[]'::jsonb;
  v_recommendations jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated');
  end if;

  if not exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = p_organization_id
      and ou.user_id = v_user_id
      and coalesce(ou.membership_status, ou.status) = 'active'
  ) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.is_preferred desc, row_data.status, row_data.partner_name), '[]'::jsonb)
  into v_rows
  from (
    select
      pc.id,
      pc.source_organization_id,
      pc.target_organization_id,
      pc.relationship_type,
      pc.status,
      pc.source_preferred,
      pc.target_preferred,
      case when pc.source_organization_id = p_organization_id then pc.source_preferred else pc.target_preferred end as is_preferred,
      case when pc.source_organization_id = p_organization_id then 'outgoing' else 'incoming' end as direction,
      partner.id as partner_organization_id,
      partner.name as partner_name,
      partner.display_name as partner_display_name,
      coalesce(partner.organization_type, partner.type) as partner_organization_type,
      partner.organization_subtype as partner_organization_subtype,
      pc.created_by,
      pc.accepted_by,
      pc.created_at,
      pc.accepted_at,
      analytics.transaction_count,
      analytics.active_transaction_count,
      analytics.completed_transaction_count,
      analytics.first_transaction_date,
      analytics.last_transaction_date
    from public.partner_connections pc
    join public.organisations partner
      on partner.id = case when pc.source_organization_id = p_organization_id then pc.target_organization_id else pc.source_organization_id end
    cross join lateral (
      select
        count(distinct tx.id)::integer as transaction_count,
        count(distinct tx.id) filter (
          where lower(coalesce(tx.stage, tx.current_main_stage, tx.status, '')) not in ('registered', 'completed', 'complete', 'cancelled', 'archived')
        )::integer as active_transaction_count,
        count(distinct tx.id) filter (
          where lower(coalesce(tx.stage, tx.current_main_stage, tx.status, '')) in ('registered', 'completed', 'complete')
        )::integer as completed_transaction_count,
        min(tx.created_at) as first_transaction_date,
        max(tx.created_at) as last_transaction_date
      from public.transactions tx
      left join public.transaction_role_players trp on trp.transaction_id = tx.id
      where (
        tx.organisation_id in (p_organization_id, partner.id)
        and (
          trp.organisation_id in (p_organization_id, partner.id)
          or trp.partner_organisation_id in (p_organization_id, partner.id)
          or trp.assigned_organisation_id in (p_organization_id, partner.id)
          or tx.originating_partner_organisation_id in (p_organization_id, partner.id)
          or tx.referral_source_organisation_id in (p_organization_id, partner.id)
        )
      )
    ) analytics
    where (pc.source_organization_id = p_organization_id or pc.target_organization_id = p_organization_id)
      and pc.status <> 'removed'
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.connection_count desc, row_data.name), '[]'::jsonb)
  into v_recommendations
  from (
    select
      o.id,
      o.name,
      o.display_name,
      coalesce(o.organization_type, o.type) as organization_type,
      o.organization_subtype,
      count(pc.id)::integer as connection_count
    from public.organisations o
    left join public.partner_connections pc
      on (pc.source_organization_id = o.id or pc.target_organization_id = o.id)
      and pc.status = 'connected'
    where o.id <> p_organization_id
      and coalesce(o.status, 'active') = 'active'
      and coalesce(o.discovery_visibility, 'public') <> 'hidden'
      and public.bridge_phase4_can_connect(p_organization_id, o.id)
      and not exists (
        select 1
        from public.partner_connections existing
        where existing.status in ('pending', 'connected', 'blocked')
          and (
            (existing.source_organization_id = p_organization_id and existing.target_organization_id = o.id)
            or (existing.source_organization_id = o.id and existing.target_organization_id = p_organization_id)
          )
      )
    group by o.id, o.name, o.display_name, o.organization_type, o.type, o.organization_subtype
    limit 6
  ) row_data;

  return jsonb_build_object(
    'success', true,
    'connections', v_rows,
    'recommendations', v_recommendations,
    'canManage', public.bridge_phase3_can_manage_organization(p_organization_id)
  );
end;
$$;

create or replace function public.bridge_phase4_search_partner_candidates(
  p_organization_id uuid,
  p_query text,
  p_organization_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_type text := nullif(public.bridge_phase3_normalize_organization_type(p_organization_type), 'service_provider');
  v_rows jsonb := '[]'::jsonb;
begin
  if not public.bridge_phase3_can_manage_organization(p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if v_query is null or length(v_query) < 2 then
    return jsonb_build_object('success', true, 'organizations', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.name), '[]'::jsonb)
  into v_rows
  from (
    select
      o.id,
      o.name,
      o.display_name,
      coalesce(o.organization_type, o.type) as organization_type,
      o.organization_subtype,
      o.status,
      o.website,
      existing.id as connection_id,
      existing.status as connection_status,
      case
        when existing.id is null then null
        when existing.source_organization_id = p_organization_id then 'outgoing'
        else 'incoming'
      end as connection_direction
    from public.organisations o
    left join public.partner_connections existing
      on (
        (existing.source_organization_id = p_organization_id and existing.target_organization_id = o.id)
        or (existing.source_organization_id = o.id and existing.target_organization_id = p_organization_id)
      )
      and existing.status <> 'removed'
    where o.id <> p_organization_id
      and coalesce(o.status, 'active') = 'active'
      and coalesce(o.discovery_visibility, 'public') <> 'hidden'
      and (v_type is null or public.bridge_phase3_normalize_organization_type(coalesce(o.organization_type, o.type)) = v_type)
      and public.bridge_phase4_can_connect(p_organization_id, o.id)
      and (
        o.name ilike '%' || v_query || '%'
        or o.display_name ilike '%' || v_query || '%'
        or o.email ilike '%' || v_query || '%'
        or o.company_email ilike '%' || v_query || '%'
      )
    limit 12
  ) row_data;

  return jsonb_build_object('success', true, 'organizations', v_rows);
end;
$$;

create or replace function public.bridge_phase4_request_partner_connection(
  p_source_organization_id uuid,
  p_target_organization_id uuid,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_relationship_type text;
  v_existing public.partner_connections%rowtype;
  v_connection public.partner_connections%rowtype;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated');
  end if;

  if not public.bridge_phase3_can_manage_organization(p_source_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if not public.bridge_phase4_can_connect(p_source_organization_id, p_target_organization_id) then
    return jsonb_build_object('success', false, 'code', 'connection_not_allowed');
  end if;

  select *
  into v_existing
  from public.partner_connections
  where (
    source_organization_id = p_source_organization_id and target_organization_id = p_target_organization_id
  ) or (
    source_organization_id = p_target_organization_id and target_organization_id = p_source_organization_id
  )
  order by created_at desc
  limit 1
  for update;

  if v_existing.id is not null and v_existing.status = 'connected' then
    return jsonb_build_object('success', false, 'code', 'connection_already_connected', 'connection', to_jsonb(v_existing));
  end if;

  if v_existing.id is not null and v_existing.status = 'pending' then
    return jsonb_build_object('success', true, 'connection', to_jsonb(v_existing), 'alreadyPending', true);
  end if;

  v_relationship_type := public.bridge_phase4_relationship_type(p_source_organization_id, p_target_organization_id);

  if v_existing.id is not null
     and v_existing.source_organization_id = p_source_organization_id
     and v_existing.target_organization_id = p_target_organization_id then
    update public.partner_connections
    set status = 'pending',
        relationship_type = v_relationship_type,
        created_by = v_actor,
        accepted_by = null,
        declined_by = null,
        blocked_by = null,
        removed_by = null,
        accepted_at = null,
        declined_at = null,
        blocked_at = null,
        removed_at = null,
        metadata = jsonb_build_object('message', nullif(trim(coalesce(p_message, '')), ''))
    where id = v_existing.id
    returning * into v_connection;
  else
    insert into public.partner_connections (
      source_organization_id,
      target_organization_id,
      relationship_type,
      status,
      created_by,
      metadata
    )
    values (
      p_source_organization_id,
      p_target_organization_id,
      v_relationship_type,
      'pending',
      v_actor,
      jsonb_build_object('message', nullif(trim(coalesce(p_message, '')), ''))
    )
    returning * into v_connection;
  end if;

  perform public.bridge_phase4_log_partner_connection_event(
    v_connection.id,
    'Connection Requested',
    v_actor,
    jsonb_build_object('message', p_message)
  );

  return jsonb_build_object('success', true, 'connection', to_jsonb(v_connection));
end;
$$;

create or replace function public.bridge_phase4_review_partner_connection(
  p_connection_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_connection public.partner_connections%rowtype;
  v_target_org public.organisations%rowtype;
  v_target_role text;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated');
  end if;

  select *
  into v_connection
  from public.partner_connections
  where id = p_connection_id
  for update;

  if v_connection.id is null then
    return jsonb_build_object('success', false, 'code', 'connection_not_found');
  end if;

  if not public.bridge_phase3_can_manage_organization(v_connection.target_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if v_action in ('accept', 'accepted', 'connect', 'connected') then
    update public.partner_connections
    set status = 'connected',
        accepted_by = v_actor,
        accepted_at = now(),
        declined_by = null,
        declined_at = null,
        blocked_by = null,
        blocked_at = null,
        removed_by = null,
        removed_at = null
    where id = p_connection_id
    returning * into v_connection;

    select *
    into v_target_org
    from public.organisations
    where id = v_connection.target_organization_id;

    v_target_role := public.bridge_phase4_partner_role_type(coalesce(v_target_org.organization_type, v_target_org.type));

    update public.partner_prospects
    set organisation_id = v_target_org.id,
        organization_id = v_target_org.id,
        status = 'connected',
        updated_at = now()
    where (
      coalesce(organisation_id, organization_id) = v_target_org.id
      or (company_key = public.bridge_partner_prospect_key(v_target_org.name) and role_type = v_target_role)
    );

    perform public.bridge_phase4_log_partner_connection_event(
      v_connection.id,
      'Connection Accepted',
      v_actor,
      '{}'::jsonb
    );
  elsif v_action in ('decline', 'declined', 'reject', 'rejected') then
    update public.partner_connections
    set status = 'declined',
        declined_by = v_actor,
        declined_at = now()
    where id = p_connection_id
    returning * into v_connection;

    perform public.bridge_phase4_log_partner_connection_event(
      v_connection.id,
      'Connection Declined',
      v_actor,
      '{}'::jsonb
    );
  else
    return jsonb_build_object('success', false, 'code', 'invalid_action');
  end if;

  return jsonb_build_object('success', true, 'connection', to_jsonb(v_connection));
end;
$$;

create or replace function public.bridge_phase4_set_partner_preferred(
  p_organization_id uuid,
  p_connection_id uuid,
  p_preferred boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_connection public.partner_connections%rowtype;
  v_event_type text;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated');
  end if;

  if not public.bridge_phase3_can_manage_organization(p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  select *
  into v_connection
  from public.partner_connections
  where id = p_connection_id
    and p_organization_id in (source_organization_id, target_organization_id)
  for update;

  if v_connection.id is null then
    return jsonb_build_object('success', false, 'code', 'connection_not_found');
  end if;

  if v_connection.status <> 'connected' then
    return jsonb_build_object('success', false, 'code', 'connection_not_connected');
  end if;

  if p_organization_id = v_connection.source_organization_id then
    update public.partner_connections
    set source_preferred = coalesce(p_preferred, false)
    where id = p_connection_id
    returning * into v_connection;
  else
    update public.partner_connections
    set target_preferred = coalesce(p_preferred, false)
    where id = p_connection_id
    returning * into v_connection;
  end if;

  v_event_type := case when coalesce(p_preferred, false) then 'Partner Marked Preferred' else 'Partner Unmarked Preferred' end;
  perform public.bridge_phase4_log_partner_connection_event(
    v_connection.id,
    v_event_type,
    v_actor,
    jsonb_build_object('preferredByOrganizationId', p_organization_id)
  );

  return jsonb_build_object('success', true, 'connection', to_jsonb(v_connection));
end;
$$;

create or replace function public.bridge_phase4_remove_partner_connection(
  p_organization_id uuid,
  p_connection_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_connection public.partner_connections%rowtype;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated');
  end if;

  if not public.bridge_phase3_can_manage_organization(p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  update public.partner_connections
  set status = 'removed',
      removed_by = v_actor,
      removed_at = now()
  where id = p_connection_id
    and p_organization_id in (source_organization_id, target_organization_id)
  returning * into v_connection;

  if v_connection.id is null then
    return jsonb_build_object('success', false, 'code', 'connection_not_found');
  end if;

  perform public.bridge_phase4_log_partner_connection_event(
    v_connection.id,
    'Connection Removed',
    v_actor,
    jsonb_build_object('removedByOrganizationId', p_organization_id)
  );

  return jsonb_build_object('success', true, 'connection', to_jsonb(v_connection));
end;
$$;

create or replace function public.bridge_phase4_log_transaction_partner_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_partner_org_id uuid;
  v_connection public.partner_connections%rowtype;
  v_event_type text;
begin
  if lower(coalesce(new.selection_source, '')) not in ('connected_partner', 'preferred_partner') then
    return new;
  end if;

  v_partner_org_id := coalesce(new.partner_organisation_id, new.assigned_organisation_id, new.organisation_id);
  if v_partner_org_id is null then
    return new;
  end if;

  select *
  into v_transaction
  from public.transactions
  where id = new.transaction_id;

  if v_transaction.id is null or v_transaction.organisation_id is null then
    return new;
  end if;

  select *
  into v_connection
  from public.partner_connections pc
  where pc.status = 'connected'
    and (
      (pc.source_organization_id = v_transaction.organisation_id and pc.target_organization_id = v_partner_org_id)
      or (pc.source_organization_id = v_partner_org_id and pc.target_organization_id = v_transaction.organisation_id)
    )
  order by pc.accepted_at desc nulls last, pc.created_at desc
  limit 1;

  if v_connection.id is null then
    return new;
  end if;

  v_event_type := 'Transaction Created Via Partner';
  perform public.bridge_phase4_log_partner_connection_event(
    v_connection.id,
    v_event_type,
    new.assigned_by,
    jsonb_build_object('transactionId', new.transaction_id, 'roleType', new.role_type, 'selectionSource', new.selection_source)
  );

  return new;
end;
$$;

drop trigger if exists transaction_role_players_phase4_partner_usage on public.transaction_role_players;
create trigger transaction_role_players_phase4_partner_usage
after insert on public.transaction_role_players
for each row execute function public.bridge_phase4_log_transaction_partner_usage();

alter table public.partner_connections enable row level security;

drop policy if exists partner_connections_select_own_orgs on public.partner_connections;
create policy partner_connections_select_own_orgs
on public.partner_connections
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_users ou
    where ou.user_id = auth.uid()
      and coalesce(ou.membership_status, ou.status) = 'active'
      and ou.organisation_id in (partner_connections.source_organization_id, partner_connections.target_organization_id)
  )
);

drop policy if exists partner_connections_insert_source_admin on public.partner_connections;
create policy partner_connections_insert_source_admin
on public.partner_connections
for insert
to authenticated
with check (
  public.bridge_phase3_can_manage_organization(source_organization_id)
  and created_by = auth.uid()
);

drop policy if exists partner_connections_update_related_admin on public.partner_connections;
create policy partner_connections_update_related_admin
on public.partner_connections
for update
to authenticated
using (
  public.bridge_phase3_can_manage_organization(source_organization_id)
  or public.bridge_phase3_can_manage_organization(target_organization_id)
)
with check (
  public.bridge_phase3_can_manage_organization(source_organization_id)
  or public.bridge_phase3_can_manage_organization(target_organization_id)
);

grant select, insert, update on public.partner_connections to authenticated;
grant execute on function public.bridge_phase4_organization_type(uuid) to authenticated;
grant execute on function public.bridge_phase4_relationship_type(uuid, uuid) to authenticated;
grant execute on function public.bridge_phase4_can_connect(uuid, uuid) to authenticated;
grant execute on function public.bridge_phase4_partner_role_type(text) to authenticated;
grant execute on function public.bridge_phase4_list_partner_connections(uuid) to authenticated;
grant execute on function public.bridge_phase4_search_partner_candidates(uuid, text, text) to authenticated;
grant execute on function public.bridge_phase4_request_partner_connection(uuid, uuid, text) to authenticated;
grant execute on function public.bridge_phase4_review_partner_connection(uuid, text) to authenticated;
grant execute on function public.bridge_phase4_set_partner_preferred(uuid, uuid, boolean) to authenticated;
grant execute on function public.bridge_phase4_remove_partner_connection(uuid, uuid) to authenticated;
