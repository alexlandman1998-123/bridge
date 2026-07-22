begin;

alter table public.organisation_partners
  add column if not exists organisation_preferred boolean not null default false,
  add column if not exists partner_preferred boolean not null default false,
  add column if not exists accepted_by uuid references auth.users(id) on delete set null,
  add column if not exists declined_by uuid references auth.users(id) on delete set null,
  add column if not exists blocked_by uuid references auth.users(id) on delete set null,
  add column if not exists removed_by uuid references auth.users(id) on delete set null,
  add column if not exists declined_at timestamptz,
  add column if not exists blocked_at timestamptz,
  add column if not exists removed_at timestamptz;

alter table public.organisation_partners
  drop constraint if exists organisation_partners_status_check;
alter table public.organisation_partners
  add constraint organisation_partners_status_check
  check (relationship_status in ('pending', 'accepted', 'declined', 'blocked', 'removed'));

create or replace function public.bridge_sync_canonical_partner_relationship()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.relationship_status is not distinct from old.relationship_status then
    v_status := lower(coalesce(nullif(new.status, ''), 'pending'));
  else
    v_status := lower(coalesce(nullif(new.relationship_status, ''), nullif(new.status, ''), 'pending'));
  end if;

  if v_status = 'connected' then v_status := 'accepted'; end if;
  if v_status not in ('pending', 'accepted', 'declined', 'blocked', 'removed') then
    raise exception 'Unsupported canonical partner relationship status: %', v_status using errcode = '23514';
  end if;

  new.relationship_status := v_status;
  new.status := v_status;

  if tg_op = 'INSERT' and coalesce(new.preferred, false) then
    new.organisation_preferred := true;
  elsif tg_op = 'UPDATE' and new.preferred is distinct from old.preferred then
    new.organisation_preferred := coalesce(new.preferred, false);
  end if;

  if new.organisation_preferred then
    new.preferred := true;
  end if;
  if v_status = 'accepted' and new.accepted_at is null then
    new.accepted_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists canonical_partner_relationship_sync on public.organisation_partners;
create trigger canonical_partner_relationship_sync
before insert or update on public.organisation_partners
for each row execute function public.bridge_sync_canonical_partner_relationship();

update public.organisation_partners
set organisation_preferred = organisation_preferred or coalesce(preferred, false),
    status = coalesce(nullif(status, ''), relationship_status),
    updated_at = now()
where coalesce(preferred, false)
   or status is null
   or status = '';

do $$
declare
  v_directory_function regprocedure := to_regprocedure('public.bridge_list_organisation_partner_directory(uuid)');
  v_definition text;
  v_updated_definition text;
begin
  if v_directory_function is null then return; end if;

  select pg_get_functiondef(v_directory_function) into v_definition;
  v_updated_definition := replace(
    v_definition,
    'coalesce(relationship.preferred, false) as is_preferred',
    'case when relationship.organisation_id = p_organisation_id then relationship.organisation_preferred else relationship.partner_preferred end as is_preferred'
  );

  if v_updated_definition = v_definition then
    raise exception 'Unified partner-directory preference projection could not be upgraded.' using errcode = '55000';
  end if;

  execute v_updated_definition;
end;
$$;

create table if not exists public.partner_relationship_aliases (
  alias_connection_id uuid primary key,
  canonical_relationship_id uuid not null
    references public.organisation_partners(id) on delete restrict,
  source_organisation_id uuid not null references public.organisations(id) on delete cascade,
  target_organisation_id uuid not null references public.organisations(id) on delete cascade,
  migrated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.partner_relationship_aliases is
  'Maps retired partner_connections IDs to canonical organisation_partners IDs.';

create index if not exists partner_relationship_aliases_canonical_idx
  on public.partner_relationship_aliases (canonical_relationship_id);

do $$
declare
  v_legacy public.partner_connections%rowtype;
  v_relationship public.organisation_partners%rowtype;
  v_status text;
begin
  for v_legacy in
    select * from public.partner_connections order by created_at, id
  loop
    perform pg_advisory_xact_lock(hashtext(
      least(v_legacy.source_organization_id, v_legacy.target_organization_id)::text || ':' ||
      greatest(v_legacy.source_organization_id, v_legacy.target_organization_id)::text
    ));

    select * into v_relationship
    from public.organisation_partners
    where (
      organisation_id = v_legacy.source_organization_id
      and partner_organisation_id = v_legacy.target_organization_id
    ) or (
      organisation_id = v_legacy.target_organization_id
      and partner_organisation_id = v_legacy.source_organization_id
    )
    limit 1
    for update;

    v_status := case lower(coalesce(v_legacy.status, 'pending'))
      when 'connected' then 'accepted'
      when 'removed' then 'removed'
      when 'blocked' then 'blocked'
      when 'declined' then 'declined'
      else 'pending'
    end;

    if v_relationship.id is null then
      insert into public.organisation_partners (
        organisation_id,
        partner_organisation_id,
        partner_type,
        relationship_status,
        status,
        relationship_type,
        visibility_level,
        scope_type,
        scope_id,
        preferred,
        organisation_preferred,
        partner_preferred,
        created_by,
        accepted_by,
        declined_by,
        blocked_by,
        removed_by,
        accepted_at,
        declined_at,
        blocked_at,
        removed_at,
        metadata,
        created_at,
        updated_at
      ) values (
        v_legacy.source_organization_id,
        v_legacy.target_organization_id,
        public.bridge_phase4_partner_role_type(
          public.bridge_phase4_organization_type(v_legacy.target_organization_id)
        ),
        v_status,
        v_status,
        case when v_legacy.source_preferred then 'preferred' else 'approved' end,
        case when v_legacy.source_preferred then 'preferred_partners' else 'connected_partners' end,
        'organisation',
        v_legacy.source_organization_id,
        v_legacy.source_preferred,
        v_legacy.source_preferred,
        v_legacy.target_preferred,
        v_legacy.created_by,
        v_legacy.accepted_by,
        v_legacy.declined_by,
        v_legacy.blocked_by,
        v_legacy.removed_by,
        v_legacy.accepted_at,
        v_legacy.declined_at,
        v_legacy.blocked_at,
        v_legacy.removed_at,
        coalesce(v_legacy.metadata, '{}'::jsonb) || jsonb_build_object(
          'legacyPartnerConnectionId', v_legacy.id,
          'connectionRelationshipType', v_legacy.relationship_type
        ),
        v_legacy.created_at,
        v_legacy.updated_at
      ) returning * into v_relationship;
    else
      update public.organisation_partners
      set relationship_status = case
            when relationship_status = 'accepted' or v_status = 'accepted' then 'accepted'
            when relationship_status = 'blocked' or v_status = 'blocked' then 'blocked'
            when relationship_status = 'pending' or v_status = 'pending' then 'pending'
            when relationship_status = 'declined' or v_status = 'declined' then 'declined'
            else 'removed'
          end,
          status = case
            when relationship_status = 'accepted' or v_status = 'accepted' then 'accepted'
            when relationship_status = 'blocked' or v_status = 'blocked' then 'blocked'
            when relationship_status = 'pending' or v_status = 'pending' then 'pending'
            when relationship_status = 'declined' or v_status = 'declined' then 'declined'
            else 'removed'
          end,
          organisation_preferred = organisation_preferred or case
            when organisation_id = v_legacy.source_organization_id then v_legacy.source_preferred
            else v_legacy.target_preferred
          end,
          partner_preferred = partner_preferred or case
            when partner_organisation_id = v_legacy.target_organization_id then v_legacy.target_preferred
            else v_legacy.source_preferred
          end,
          preferred = preferred or case
            when organisation_id = v_legacy.source_organization_id then v_legacy.source_preferred
            else v_legacy.target_preferred
          end,
          accepted_by = coalesce(accepted_by, v_legacy.accepted_by),
          declined_by = coalesce(declined_by, v_legacy.declined_by),
          blocked_by = coalesce(blocked_by, v_legacy.blocked_by),
          removed_by = coalesce(removed_by, v_legacy.removed_by),
          accepted_at = coalesce(accepted_at, v_legacy.accepted_at),
          declined_at = coalesce(declined_at, v_legacy.declined_at),
          blocked_at = coalesce(blocked_at, v_legacy.blocked_at),
          removed_at = coalesce(removed_at, v_legacy.removed_at),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'legacyPartnerConnectionId', v_legacy.id,
            'connectionRelationshipType', v_legacy.relationship_type
          ),
          updated_at = greatest(updated_at, v_legacy.updated_at)
      where id = v_relationship.id
      returning * into v_relationship;
    end if;

    insert into public.partner_relationship_aliases (
      alias_connection_id,
      canonical_relationship_id,
      source_organisation_id,
      target_organisation_id,
      metadata
    ) values (
      v_legacy.id,
      v_relationship.id,
      v_legacy.source_organization_id,
      v_legacy.target_organization_id,
      jsonb_build_object('legacyStatus', v_legacy.status, 'legacyRelationshipType', v_legacy.relationship_type)
    )
    on conflict (alias_connection_id) do update
      set canonical_relationship_id = excluded.canonical_relationship_id,
          metadata = excluded.metadata;
  end loop;
end;
$$;

alter table public.transaction_partner_assignments
  add column if not exists partner_relationship_id uuid
    references public.organisation_partners(id) on delete set null;

update public.transaction_partner_assignments assignment
set partner_relationship_id = alias.canonical_relationship_id
from public.partner_relationship_aliases alias
where assignment.partner_relationship_id is null
  and assignment.partner_connection_id = alias.alias_connection_id;

update public.transaction_partner_assignments assignment
set partner_relationship_id = relationship.id
from public.organisation_partners relationship
where assignment.partner_relationship_id is null
  and assignment.agency_organisation_id is not null
  and assignment.partner_organisation_id is not null
  and (
    (relationship.organisation_id = assignment.agency_organisation_id
      and relationship.partner_organisation_id = assignment.partner_organisation_id)
    or
    (relationship.organisation_id = assignment.partner_organisation_id
      and relationship.partner_organisation_id = assignment.agency_organisation_id)
  );

create index if not exists transaction_partner_assignments_relationship_idx
  on public.transaction_partner_assignments (partner_relationship_id)
  where partner_relationship_id is not null;

create or replace function public.bridge_resolve_partner_relationship_id(p_identifier uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select relationship.id from public.organisation_partners relationship where relationship.id = p_identifier),
    (select alias.canonical_relationship_id from public.partner_relationship_aliases alias where alias.alias_connection_id = p_identifier)
  )
$$;

create or replace function public.bridge_phase4_connection_payload(
  p_relationship_id uuid,
  p_context_organisation_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(payload)
  from (
    select
      relationship.id,
      relationship.organisation_id as source_organization_id,
      relationship.partner_organisation_id as target_organization_id,
      public.bridge_phase4_relationship_type(
        relationship.organisation_id,
        relationship.partner_organisation_id
      ) as relationship_type,
      case lower(coalesce(relationship.status, relationship.relationship_status, 'pending'))
        when 'accepted' then 'connected'
        else lower(coalesce(relationship.status, relationship.relationship_status, 'pending'))
      end as status,
      relationship.organisation_preferred as source_preferred,
      relationship.partner_preferred as target_preferred,
      case
        when p_context_organisation_id = relationship.partner_organisation_id
          then relationship.partner_preferred
        else relationship.organisation_preferred
      end as is_preferred,
      case
        when p_context_organisation_id = relationship.partner_organisation_id then 'incoming'
        else 'outgoing'
      end as direction,
      relationship.accepted_by,
      relationship.declined_by,
      relationship.blocked_by,
      relationship.removed_by,
      relationship.accepted_at,
      relationship.declined_at,
      relationship.blocked_at,
      relationship.removed_at,
      relationship.created_by,
      relationship.metadata,
      relationship.created_at,
      relationship.updated_at
    from public.organisation_partners relationship
    where relationship.id = p_relationship_id
  ) payload
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
set search_path = public, pg_temp
as $$
declare
  v_relationship public.organisation_partners%rowtype;
  v_relationship_id uuid := public.bridge_resolve_partner_relationship_id(p_connection_id);
begin
  select * into v_relationship
  from public.organisation_partners
  where id = v_relationship_id;

  if v_relationship.id is null then return; end if;

  perform public.bridge_phase3_log_organization_event(
    v_relationship.organisation_id,
    p_event_type,
    p_actor_user_id,
    null, null, null,
    jsonb_build_object(
      'relationshipId', v_relationship.id,
      'connectionId', v_relationship.id,
      'counterpartyOrganizationId', v_relationship.partner_organisation_id
    ) || coalesce(p_event_data, '{}'::jsonb)
  );

  perform public.bridge_phase3_log_organization_event(
    v_relationship.partner_organisation_id,
    p_event_type,
    p_actor_user_id,
    null, null, null,
    jsonb_build_object(
      'relationshipId', v_relationship.id,
      'connectionId', v_relationship.id,
      'counterpartyOrganizationId', v_relationship.organisation_id
    ) || coalesce(p_event_data, '{}'::jsonb)
  );
end;
$$;

create or replace function public.bridge_phase4_list_partner_connections(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_rows jsonb := '[]'::jsonb;
  v_recommendations jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated');
  end if;
  if not public.bridge_is_active_member(p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.is_preferred desc, row_data.status, row_data.partner_name), '[]'::jsonb)
  into v_rows
  from (
    select
      relationship.id,
      relationship.id as relationship_id,
      relationship.organisation_id as source_organization_id,
      relationship.partner_organisation_id as target_organization_id,
      public.bridge_phase4_relationship_type(relationship.organisation_id, relationship.partner_organisation_id) as relationship_type,
      case lower(coalesce(relationship.status, relationship.relationship_status, 'pending'))
        when 'accepted' then 'connected'
        else lower(coalesce(relationship.status, relationship.relationship_status, 'pending'))
      end as status,
      relationship.organisation_preferred as source_preferred,
      relationship.partner_preferred as target_preferred,
      case when relationship.organisation_id = p_organization_id
        then relationship.organisation_preferred else relationship.partner_preferred end as is_preferred,
      case when relationship.organisation_id = p_organization_id then 'outgoing' else 'incoming' end as direction,
      partner.id as partner_organization_id,
      partner.name as partner_name,
      partner.display_name as partner_display_name,
      coalesce(partner.organization_type, partner.type) as partner_organization_type,
      partner.organization_subtype as partner_organization_subtype,
      relationship.created_by,
      relationship.accepted_by,
      relationship.created_at,
      relationship.accepted_at,
      analytics.transaction_count,
      analytics.active_transaction_count,
      analytics.completed_transaction_count,
      analytics.first_transaction_date,
      analytics.last_transaction_date
    from public.organisation_partners relationship
    join public.organisations partner
      on partner.id = case when relationship.organisation_id = p_organization_id
        then relationship.partner_organisation_id else relationship.organisation_id end
    cross join lateral (
      select
        count(distinct tx.id)::integer as transaction_count,
        count(distinct tx.id) filter (
          where lower(coalesce(tx.stage, tx.current_main_stage, '')) not in ('registered', 'completed', 'complete', 'cancelled', 'archived')
        )::integer as active_transaction_count,
        count(distinct tx.id) filter (
          where lower(coalesce(tx.stage, tx.current_main_stage, '')) in ('registered', 'completed', 'complete')
        )::integer as completed_transaction_count,
        min(tx.created_at) as first_transaction_date,
        max(tx.created_at) as last_transaction_date
      from public.transactions tx
      left join public.transaction_role_players role_player on role_player.transaction_id = tx.id
      where tx.organisation_id in (p_organization_id, partner.id)
        and (
          role_player.organisation_id in (p_organization_id, partner.id)
          or role_player.partner_organisation_id in (p_organization_id, partner.id)
          or role_player.assigned_organisation_id in (p_organization_id, partner.id)
          or tx.originating_partner_organisation_id in (p_organization_id, partner.id)
          or tx.referral_source_organisation_id in (p_organization_id, partner.id)
        )
    ) analytics
    where p_organization_id in (relationship.organisation_id, relationship.partner_organisation_id)
      and lower(coalesce(relationship.status, relationship.relationship_status, 'pending')) <> 'removed'
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.connection_count desc, row_data.name), '[]'::jsonb)
  into v_recommendations
  from (
    select
      organisation.id,
      organisation.name,
      organisation.display_name,
      coalesce(organisation.organization_type, organisation.type) as organization_type,
      organisation.organization_subtype,
      count(relationship.id) filter (
        where lower(coalesce(relationship.status, relationship.relationship_status, '')) = 'accepted'
      )::integer as connection_count
    from public.organisations organisation
    left join public.organisation_partners relationship
      on organisation.id in (relationship.organisation_id, relationship.partner_organisation_id)
    where organisation.id <> p_organization_id
      and coalesce(organisation.status, 'active') = 'active'
      and coalesce(organisation.discovery_visibility, 'public') <> 'hidden'
      and public.bridge_phase4_can_connect(p_organization_id, organisation.id)
      and not exists (
        select 1 from public.organisation_partners existing
        where lower(coalesce(existing.status, existing.relationship_status, 'pending')) in ('pending', 'accepted', 'blocked')
          and p_organization_id in (existing.organisation_id, existing.partner_organisation_id)
          and organisation.id in (existing.organisation_id, existing.partner_organisation_id)
      )
    group by organisation.id, organisation.name, organisation.display_name,
      organisation.organization_type, organisation.type, organisation.organization_subtype
    limit 6
  ) row_data;

  return jsonb_build_object(
    'success', true,
    'connections', v_rows,
    'recommendations', v_recommendations,
    'canManage', public.bridge_phase3_can_manage_organization(p_organization_id),
    'storage', 'organisation_partners'
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
set search_path = public, pg_temp
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
      organisation.id,
      organisation.name,
      organisation.display_name,
      coalesce(organisation.organization_type, organisation.type) as organization_type,
      organisation.organization_subtype,
      organisation.status,
      organisation.website,
      existing.id as connection_id,
      case lower(coalesce(existing.status, existing.relationship_status, ''))
        when 'accepted' then 'connected'
        else lower(coalesce(existing.status, existing.relationship_status, ''))
      end as connection_status,
      case when existing.id is null then null
        when existing.organisation_id = p_organization_id then 'outgoing' else 'incoming' end as connection_direction
    from public.organisations organisation
    left join public.organisation_partners existing
      on p_organization_id in (existing.organisation_id, existing.partner_organisation_id)
      and organisation.id in (existing.organisation_id, existing.partner_organisation_id)
      and lower(coalesce(existing.status, existing.relationship_status, 'pending')) <> 'removed'
    where organisation.id <> p_organization_id
      and coalesce(organisation.status, 'active') = 'active'
      and coalesce(organisation.discovery_visibility, 'public') <> 'hidden'
      and (v_type is null or public.bridge_phase3_normalize_organization_type(
        coalesce(organisation.organization_type, organisation.type)
      ) = v_type)
      and public.bridge_phase4_can_connect(p_organization_id, organisation.id)
      and (
        organisation.name ilike '%' || v_query || '%'
        or organisation.display_name ilike '%' || v_query || '%'
        or organisation.email ilike '%' || v_query || '%'
        or organisation.company_email ilike '%' || v_query || '%'
      )
    limit 12
  ) row_data;

  return jsonb_build_object('success', true, 'organizations', v_rows, 'storage', 'organisation_partners');
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
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_relationship public.organisation_partners%rowtype;
  v_relationship_type text;
  v_current_status text;
begin
  if v_actor is null then return jsonb_build_object('success', false, 'code', 'not_authenticated'); end if;
  if not public.bridge_phase3_can_manage_organization(p_source_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;
  if not public.bridge_phase4_can_connect(p_source_organization_id, p_target_organization_id) then
    return jsonb_build_object('success', false, 'code', 'connection_not_allowed');
  end if;

  perform pg_advisory_xact_lock(hashtext(
    least(p_source_organization_id, p_target_organization_id)::text || ':' ||
    greatest(p_source_organization_id, p_target_organization_id)::text
  ));

  select * into v_relationship
  from public.organisation_partners
  where p_source_organization_id in (organisation_id, partner_organisation_id)
    and p_target_organization_id in (organisation_id, partner_organisation_id)
  limit 1 for update;

  v_current_status := lower(coalesce(v_relationship.status, v_relationship.relationship_status, ''));
  if v_relationship.id is not null and v_current_status = 'accepted' then
    return jsonb_build_object(
      'success', false,
      'code', 'connection_already_connected',
      'connection', public.bridge_phase4_connection_payload(v_relationship.id, p_source_organization_id)
    );
  end if;
  if v_relationship.id is not null and v_current_status = 'pending' then
    return jsonb_build_object(
      'success', true,
      'connection', public.bridge_phase4_connection_payload(v_relationship.id, p_source_organization_id),
      'alreadyPending', true
    );
  end if;

  v_relationship_type := public.bridge_phase4_relationship_type(p_source_organization_id, p_target_organization_id);
  if v_relationship.id is null then
    insert into public.organisation_partners (
      organisation_id, partner_organisation_id, partner_type,
      relationship_status, status, relationship_type, visibility_level,
      scope_type, scope_id, preferred, organisation_preferred, partner_preferred,
      created_by, metadata
    ) values (
      p_source_organization_id, p_target_organization_id,
      public.bridge_phase4_partner_role_type(public.bridge_phase4_organization_type(p_target_organization_id)),
      'pending', 'pending', 'approved', 'connected_partners',
      'organisation', p_source_organization_id, false, false, false,
      v_actor,
      jsonb_build_object('message', nullif(trim(coalesce(p_message, '')), ''), 'connectionRelationshipType', v_relationship_type)
    ) returning * into v_relationship;
  else
    update public.organisation_partners
    set organisation_id = p_source_organization_id,
        partner_organisation_id = p_target_organization_id,
        partner_type = public.bridge_phase4_partner_role_type(public.bridge_phase4_organization_type(p_target_organization_id)),
        relationship_status = 'pending',
        status = 'pending',
        relationship_type = 'approved',
        scope_type = 'organisation',
        scope_id = p_source_organization_id,
        created_by = v_actor,
        accepted_by = null, declined_by = null, blocked_by = null, removed_by = null,
        accepted_at = null, declined_at = null, blocked_at = null, removed_at = null,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'message', nullif(trim(coalesce(p_message, '')), ''),
          'connectionRelationshipType', v_relationship_type
        ),
        updated_at = now()
    where id = v_relationship.id
    returning * into v_relationship;
  end if;

  perform public.bridge_phase4_log_partner_connection_event(
    v_relationship.id,
    'Connection Requested',
    v_actor,
    jsonb_build_object('message', p_message)
  );
  return jsonb_build_object(
    'success', true,
    'connection', public.bridge_phase4_connection_payload(v_relationship.id, p_source_organization_id)
  );
end;
$$;

create or replace function public.bridge_phase4_review_partner_connection(
  p_connection_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_relationship public.organisation_partners%rowtype;
  v_relationship_id uuid := public.bridge_resolve_partner_relationship_id(p_connection_id);
  v_target_org public.organisations%rowtype;
  v_target_role text;
begin
  if v_actor is null then return jsonb_build_object('success', false, 'code', 'not_authenticated'); end if;
  select * into v_relationship from public.organisation_partners where id = v_relationship_id for update;
  if v_relationship.id is null then return jsonb_build_object('success', false, 'code', 'connection_not_found'); end if;
  if not public.bridge_phase3_can_manage_organization(v_relationship.partner_organisation_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if v_action in ('accept', 'accepted', 'connect', 'connected') then
    update public.organisation_partners
    set relationship_status = 'accepted', status = 'accepted',
        accepted_by = v_actor, accepted_at = now(),
        declined_by = null, declined_at = null,
        blocked_by = null, blocked_at = null,
        removed_by = null, removed_at = null,
        updated_at = now()
    where id = v_relationship.id returning * into v_relationship;

    select * into v_target_org from public.organisations where id = v_relationship.partner_organisation_id;
    v_target_role := public.bridge_phase4_partner_role_type(coalesce(v_target_org.organization_type, v_target_org.type));
    update public.partner_prospects
    set organisation_id = v_target_org.id,
        organization_id = v_target_org.id,
        status = 'connected',
        updated_at = now()
    where coalesce(organisation_id, organization_id) = v_target_org.id
       or (company_key = public.bridge_partner_prospect_key(v_target_org.name) and role_type = v_target_role);

    perform public.bridge_phase4_log_partner_connection_event(v_relationship.id, 'Connection Accepted', v_actor, '{}'::jsonb);
  elsif v_action in ('decline', 'declined', 'reject', 'rejected') then
    update public.organisation_partners
    set relationship_status = 'declined', status = 'declined',
        declined_by = v_actor, declined_at = now(), updated_at = now()
    where id = v_relationship.id returning * into v_relationship;
    perform public.bridge_phase4_log_partner_connection_event(v_relationship.id, 'Connection Declined', v_actor, '{}'::jsonb);
  else
    return jsonb_build_object('success', false, 'code', 'invalid_action');
  end if;

  return jsonb_build_object(
    'success', true,
    'connection', public.bridge_phase4_connection_payload(v_relationship.id, v_relationship.partner_organisation_id)
  );
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
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_relationship public.organisation_partners%rowtype;
  v_relationship_id uuid := public.bridge_resolve_partner_relationship_id(p_connection_id);
  v_event_type text;
begin
  if v_actor is null then return jsonb_build_object('success', false, 'code', 'not_authenticated'); end if;
  if not public.bridge_phase3_can_manage_organization(p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;
  select * into v_relationship
  from public.organisation_partners
  where id = v_relationship_id
    and p_organization_id in (organisation_id, partner_organisation_id)
  for update;
  if v_relationship.id is null then return jsonb_build_object('success', false, 'code', 'connection_not_found'); end if;
  if lower(coalesce(v_relationship.status, v_relationship.relationship_status, '')) <> 'accepted' then
    return jsonb_build_object('success', false, 'code', 'connection_not_connected');
  end if;

  if p_organization_id = v_relationship.organisation_id then
    update public.organisation_partners
    set organisation_preferred = coalesce(p_preferred, false),
        preferred = coalesce(p_preferred, false),
        relationship_type = case when coalesce(p_preferred, false) then 'preferred' else 'approved' end,
        visibility_level = case when coalesce(p_preferred, false) then 'preferred_partners' else 'connected_partners' end,
        updated_at = now()
    where id = v_relationship.id returning * into v_relationship;
  else
    update public.organisation_partners
    set partner_preferred = coalesce(p_preferred, false), updated_at = now()
    where id = v_relationship.id returning * into v_relationship;
  end if;

  v_event_type := case when coalesce(p_preferred, false)
    then 'Partner Marked Preferred' else 'Partner Unmarked Preferred' end;
  perform public.bridge_phase4_log_partner_connection_event(
    v_relationship.id, v_event_type, v_actor,
    jsonb_build_object('preferredByOrganizationId', p_organization_id)
  );
  return jsonb_build_object(
    'success', true,
    'connection', public.bridge_phase4_connection_payload(v_relationship.id, p_organization_id)
  );
end;
$$;

create or replace function public.bridge_phase4_remove_partner_connection(
  p_organization_id uuid,
  p_connection_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_relationship public.organisation_partners%rowtype;
  v_relationship_id uuid := public.bridge_resolve_partner_relationship_id(p_connection_id);
begin
  if v_actor is null then return jsonb_build_object('success', false, 'code', 'not_authenticated'); end if;
  if not public.bridge_phase3_can_manage_organization(p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  update public.organisation_partners
  set relationship_status = 'removed', status = 'removed',
      removed_by = v_actor, removed_at = now(), updated_at = now()
  where id = v_relationship_id
    and p_organization_id in (organisation_id, partner_organisation_id)
  returning * into v_relationship;
  if v_relationship.id is null then return jsonb_build_object('success', false, 'code', 'connection_not_found'); end if;

  perform public.bridge_phase4_log_partner_connection_event(
    v_relationship.id, 'Connection Removed', v_actor,
    jsonb_build_object('removedByOrganizationId', p_organization_id)
  );
  return jsonb_build_object(
    'success', true,
    'connection', public.bridge_phase4_connection_payload(v_relationship.id, p_organization_id)
  );
end;
$$;

create or replace function public.bridge_phase4_log_transaction_partner_usage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transaction public.transactions%rowtype;
  v_partner_org_id uuid;
  v_relationship_id uuid;
begin
  if lower(coalesce(new.selection_source, '')) not in ('connected_partner', 'preferred_partner') then return new; end if;
  v_partner_org_id := coalesce(new.partner_organisation_id, new.assigned_organisation_id, new.organisation_id);
  if v_partner_org_id is null then return new; end if;
  select * into v_transaction from public.transactions where id = new.transaction_id;
  if v_transaction.id is null or v_transaction.organisation_id is null then return new; end if;

  select relationship.id into v_relationship_id
  from public.organisation_partners relationship
  where lower(coalesce(relationship.status, relationship.relationship_status, '')) = 'accepted'
    and v_transaction.organisation_id in (relationship.organisation_id, relationship.partner_organisation_id)
    and v_partner_org_id in (relationship.organisation_id, relationship.partner_organisation_id)
  limit 1;
  if v_relationship_id is null then return new; end if;

  perform public.bridge_phase4_log_partner_connection_event(
    v_relationship_id,
    'Transaction Created Via Partner',
    new.assigned_by,
    jsonb_build_object('transactionId', new.transaction_id, 'roleType', new.role_type, 'selectionSource', new.selection_source)
  );
  return new;
end;
$$;

create or replace function public.bridge_activate_partner_portal_onboarding(
  p_token text,
  p_profile jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lookup jsonb;
  v_assignment_id uuid;
  v_invite_id uuid;
  v_work_item_text text;
  v_work_item_id uuid := null;
  v_relationship_id uuid := null;
  v_assignment public.transaction_partner_assignments%rowtype;
begin
  v_lookup := public.bridge_lookup_partner_portal_by_token(p_token);
  if coalesce((v_lookup ->> 'success')::boolean, false) is false then return v_lookup; end if;

  v_assignment_id := nullif(v_lookup #>> '{assignment,id}', '')::uuid;
  v_invite_id := nullif(v_lookup #>> '{invite,id}', '')::uuid;
  v_work_item_text := nullif(trim(coalesce(
    p_profile ->> 'workItemId', p_profile ->> 'work_item_id',
    v_lookup #>> '{assignment,pending_work_delivery,workItemId}',
    v_lookup #>> '{assignment,pending_work_delivery,work_item_id}', ''
  )), '');
  if v_work_item_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_work_item_id := v_work_item_text::uuid;
  end if;

  if v_invite_id is not null then
    update public.invites
    set status = case when status = 'pending' then 'accepted' else status end,
        accepted_at = coalesce(accepted_at, now()),
        accepted_by_user_id = coalesce(accepted_by_user_id, auth.uid()),
        updated_at = now()
    where id = v_invite_id;
  end if;

  select coalesce(
    partner_relationship_id,
    public.bridge_resolve_partner_relationship_id(partner_connection_id)
  ) into v_relationship_id
  from public.transaction_partner_assignments
  where id = v_assignment_id;

  if v_relationship_id is null then
    select relationship.id into v_relationship_id
    from public.transaction_partner_assignments assignment
    join public.organisation_partners relationship
      on assignment.agency_organisation_id in (relationship.organisation_id, relationship.partner_organisation_id)
      and assignment.partner_organisation_id in (relationship.organisation_id, relationship.partner_organisation_id)
    where assignment.id = v_assignment_id
    limit 1;
  end if;

  if v_relationship_id is null then
    insert into public.organisation_partners (
      organisation_id, partner_organisation_id, partner_type,
      relationship_status, status, relationship_type, visibility_level,
      scope_type, scope_id, created_by, accepted_by, accepted_at, metadata
    )
    select
      assignment.agency_organisation_id,
      assignment.partner_organisation_id,
      assignment.partner_role,
      'accepted', 'accepted', 'approved', 'connected_partners',
      'organisation', assignment.agency_organisation_id,
      coalesce(assignment.created_by, auth.uid()), auth.uid(), now(),
      jsonb_build_object('source', 'partner_portal_onboarding', 'assignmentId', assignment.id)
    from public.transaction_partner_assignments assignment
    where assignment.id = v_assignment_id
      and assignment.agency_organisation_id is not null
      and assignment.partner_organisation_id is not null
      and assignment.agency_organisation_id <> assignment.partner_organisation_id
    on conflict (
      (least(organisation_id, partner_organisation_id)),
      (greatest(organisation_id, partner_organisation_id))
    ) do update
      set relationship_status = 'accepted',
          status = 'accepted',
          accepted_by = coalesce(public.organisation_partners.accepted_by, auth.uid()),
          accepted_at = coalesce(public.organisation_partners.accepted_at, now()),
          updated_at = now()
    returning id into v_relationship_id;
  else
    update public.organisation_partners
    set relationship_status = 'accepted', status = 'accepted',
        accepted_by = coalesce(accepted_by, auth.uid()),
        accepted_at = coalesce(accepted_at, now()), updated_at = now()
    where id = v_relationship_id;
  end if;

  update public.transaction_partner_assignments
  set assignment_status = 'active',
      partner_relationship_id = coalesce(partner_relationship_id, v_relationship_id),
      assigned_person_id = coalesce(assigned_person_id, auth.uid()),
      accepted_at = coalesce(accepted_at, now()),
      activated_at = coalesce(activated_at, now()),
      work_item_id = coalesce(work_item_id, v_work_item_id),
      pending_work_delivery = coalesce(pending_work_delivery, '{}'::jsonb),
      updated_at = now()
  where id = v_assignment_id
  returning * into v_assignment;

  return jsonb_build_object('success', true, 'assignment', to_jsonb(v_assignment));
end;
$$;

create or replace function public.bridge_phase7_get_network_intelligence(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
      metrics.id,
      metrics.source_organization_id,
      metrics.target_organization_id,
      metrics.relationship_type,
      case when metrics.source_organization_id = p_organization_id then 'outgoing' else 'incoming' end as direction,
      partner.id as partner_organization_id,
      partner.name as partner_name,
      partner.display_name as partner_display_name,
      coalesce(partner.organization_type, partner.type) as partner_organization_type,
      partner.organization_subtype as partner_organization_subtype,
      metrics.transaction_count,
      metrics.active_transaction_count,
      metrics.completed_transaction_count,
      metrics.completion_rate,
      metrics.average_cycle_time,
      metrics.average_response_time,
      metrics.referral_volume,
      metrics.relationship_health_score,
      metrics.first_transaction_date,
      metrics.last_transaction_date
    from public.organization_relationship_metrics metrics
    join public.organisations partner
      on partner.id = case when metrics.source_organization_id = p_organization_id
        then metrics.target_organization_id else metrics.source_organization_id end
    where p_organization_id in (metrics.source_organization_id, metrics.target_organization_id)
    limit 50
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.transaction_count desc, row_data.organization_name), '[]'::jsonb)
  into v_referrers
  from (
    select
      organisation.id as organization_id,
      organisation.name as organization_name,
      organisation.display_name as organization_display_name,
      coalesce(organisation.organization_type, organisation.type) as organization_type,
      sum(metrics.transaction_count)::integer as transaction_count,
      sum(metrics.referral_volume)::numeric(14, 2) as referral_volume
    from public.organization_relationship_metrics metrics
    join public.organisations organisation on organisation.id = metrics.source_organization_id
    where metrics.target_organization_id = p_organization_id
    group by organisation.id, organisation.name, organisation.display_name,
      organisation.organization_type, organisation.type
    limit 8
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.transaction_count desc, row_data.organization_name), '[]'::jsonb)
  into v_partners
  from (
    select
      organisation.id as organization_id,
      organisation.name as organization_name,
      organisation.display_name as organization_display_name,
      coalesce(organisation.organization_type, organisation.type) as organization_type,
      sum(metrics.transaction_count)::integer as transaction_count,
      sum(metrics.active_transaction_count)::integer as active_transaction_count,
      max(metrics.relationship_health_score)::integer as relationship_health_score
    from public.organization_relationship_metrics metrics
    join public.organisations organisation on organisation.id = metrics.target_organization_id
    where metrics.source_organization_id = p_organization_id
    group by organisation.id, organisation.name, organisation.display_name,
      organisation.organization_type, organisation.type
    limit 8
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.network_signal desc, row_data.name), '[]'::jsonb)
  into v_suggestions
  from (
    select
      organisation.id,
      organisation.name,
      organisation.display_name,
      coalesce(organisation.organization_type, organisation.type) as organization_type,
      organisation.organization_subtype,
      count(distinct metrics.source_organization_id)::integer as network_signal,
      'Frequently selected in the Bridge network' as reason
    from public.organisations organisation
    join public.organization_relationship_metrics metrics on metrics.target_organization_id = organisation.id
    where organisation.id <> p_organization_id
      and coalesce(organisation.status, 'active') = 'active'
      and coalesce(organisation.discovery_visibility, 'public') <> 'hidden'
      and public.bridge_phase4_can_connect(p_organization_id, organisation.id)
      and not exists (
        select 1
        from public.organisation_partners relationship
        where lower(coalesce(relationship.status, relationship.relationship_status, 'pending')) in ('pending', 'accepted', 'blocked')
          and p_organization_id in (relationship.organisation_id, relationship.partner_organisation_id)
          and organisation.id in (relationship.organisation_id, relationship.partner_organisation_id)
      )
    group by organisation.id, organisation.name, organisation.display_name,
      organisation.organization_type, organisation.type, organisation.organization_subtype
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
  ) into v_summary
  from (
    select
      case when metrics.source_organization_id = p_organization_id
        then metrics.target_organization_id else metrics.source_organization_id end as partner_id,
      public.bridge_phase3_normalize_organization_type(coalesce(organisation.organization_type, organisation.type)) as partner_type,
      metrics.transaction_count,
      metrics.active_transaction_count,
      metrics.completed_transaction_count,
      metrics.referral_volume,
      metrics.average_cycle_time,
      metrics.average_response_time,
      metrics.relationship_health_score
    from public.organization_relationship_metrics metrics
    join public.organisations organisation
      on organisation.id = case when metrics.source_organization_id = p_organization_id
        then metrics.target_organization_id else metrics.source_organization_id end
    where p_organization_id in (metrics.source_organization_id, metrics.target_organization_id)
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

create or replace function public.bridge_reject_legacy_partner_connection_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'partner_connections is retired; write organisation_partners through the canonical relationship RPCs.'
    using errcode = '55000';
end;
$$;

drop trigger if exists partner_connections_canonical_write_guard on public.partner_connections;
create trigger partner_connections_canonical_write_guard
before insert or update or delete on public.partner_connections
for each statement execute function public.bridge_reject_legacy_partner_connection_write();

revoke insert, update, delete on public.partner_connections from authenticated;

grant select on public.partner_relationship_aliases to authenticated;
alter table public.partner_relationship_aliases enable row level security;
drop policy if exists partner_relationship_aliases_select_scoped on public.partner_relationship_aliases;
create policy partner_relationship_aliases_select_scoped
on public.partner_relationship_aliases
for select to authenticated
using (
  public.bridge_is_active_member(source_organisation_id)
  or public.bridge_is_active_member(target_organisation_id)
);

revoke all on function public.bridge_resolve_partner_relationship_id(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.bridge_phase4_connection_payload(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.bridge_resolve_partner_relationship_id(uuid) to authenticated, service_role;
grant execute on function public.bridge_phase4_connection_payload(uuid, uuid) to authenticated, service_role;

comment on table public.partner_connections is
  'Retired Phase 4 relationship store. Rows are retained for audit only; all writes are blocked after migration to organisation_partners.';
comment on column public.organisation_partners.organisation_preferred is
  'Preference owned by organisation_id; unlike legacy preferred, this is not mutual.';
comment on column public.organisation_partners.partner_preferred is
  'Preference owned by partner_organisation_id; unlike legacy preferred, this is not mutual.';

notify pgrst, 'reload schema';

commit;
