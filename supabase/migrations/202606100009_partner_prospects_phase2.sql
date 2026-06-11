create extension if not exists "pgcrypto";

create table if not exists public.partner_prospects (
  id uuid primary key default gen_random_uuid(),
  role_type text not null,
  company_name text not null,
  company_key text not null,
  contact_name text,
  email text,
  email_key text,
  phone text,
  status text not null default 'invited',
  bridge_user_id uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  first_invited_at timestamptz,
  last_invited_at timestamptz,
  last_invitation_date timestamptz,
  invitation_count integer not null default 0,
  accepted_invitation_count integer not null default 0,
  declined_invitation_count integer not null default 0,
  transaction_count integer not null default 0,
  last_transaction_date timestamptz,
  first_seen_date timestamptz not null default now(),
  possible_duplicate_of uuid references public.partner_prospects(id) on delete set null,
  duplicate_review_status text not null default 'none',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_prospects_role_type_check
    check (role_type in ('attorney', 'bond_originator', 'developer', 'other')),
  constraint partner_prospects_status_check
    check (status in ('invited', 'joined', 'declined', 'inactive')),
  constraint partner_prospects_duplicate_review_status_check
    check (duplicate_review_status in ('none', 'possible_duplicate', 'reviewed'))
);

alter table if exists public.partner_prospects
  add column if not exists role_type text;
alter table if exists public.partner_prospects
  add column if not exists company_name text;
alter table if exists public.partner_prospects
  add column if not exists company_key text;
alter table if exists public.partner_prospects
  add column if not exists contact_name text;
alter table if exists public.partner_prospects
  add column if not exists email text;
alter table if exists public.partner_prospects
  add column if not exists email_key text;
alter table if exists public.partner_prospects
  add column if not exists phone text;
alter table if exists public.partner_prospects
  add column if not exists status text not null default 'invited';
alter table if exists public.partner_prospects
  add column if not exists bridge_user_id uuid references auth.users(id) on delete set null;
alter table if exists public.partner_prospects
  add column if not exists joined_at timestamptz;
alter table if exists public.partner_prospects
  add column if not exists first_invited_at timestamptz;
alter table if exists public.partner_prospects
  add column if not exists last_invited_at timestamptz;
alter table if exists public.partner_prospects
  add column if not exists last_invitation_date timestamptz;
alter table if exists public.partner_prospects
  add column if not exists invitation_count integer not null default 0;
alter table if exists public.partner_prospects
  add column if not exists accepted_invitation_count integer not null default 0;
alter table if exists public.partner_prospects
  add column if not exists declined_invitation_count integer not null default 0;
alter table if exists public.partner_prospects
  add column if not exists transaction_count integer not null default 0;
alter table if exists public.partner_prospects
  add column if not exists last_transaction_date timestamptz;
alter table if exists public.partner_prospects
  add column if not exists first_seen_date timestamptz not null default now();
alter table if exists public.partner_prospects
  add column if not exists possible_duplicate_of uuid references public.partner_prospects(id) on delete set null;
alter table if exists public.partner_prospects
  add column if not exists duplicate_review_status text not null default 'none';
alter table if exists public.partner_prospects
  add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table if exists public.partner_prospects
  add column if not exists created_at timestamptz not null default now();
alter table if exists public.partner_prospects
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists partner_prospects_role_company_uidx
  on public.partner_prospects (role_type, company_key);
create index if not exists partner_prospects_role_status_idx
  on public.partner_prospects (role_type, status);
create index if not exists partner_prospects_email_idx
  on public.partner_prospects (email_key)
  where email_key is not null;
create index if not exists partner_prospects_usage_idx
  on public.partner_prospects (transaction_count desc, last_transaction_date desc nulls last);

alter table if exists public.transaction_partner_invitations
  add column if not exists partner_prospect_id uuid references public.partner_prospects(id) on delete set null;
create index if not exists transaction_partner_invitations_prospect_idx
  on public.transaction_partner_invitations (partner_prospect_id, status);

alter table if exists public.transaction_role_players
  add column if not exists partner_prospect_id uuid references public.partner_prospects(id) on delete set null;
alter table if exists public.transaction_participants
  add column if not exists partner_prospect_id uuid references public.partner_prospects(id) on delete set null;

alter table if exists public.transaction_role_players drop constraint if exists transaction_role_players_selection_source_check;
alter table if exists public.transaction_role_players
  add constraint transaction_role_players_selection_source_check
  check (selection_source in ('agency_preferred', 'buyer_appointed', 'manual', 'connected_partner', 'preferred_partner', 'recently_used', 'invited_partner', 'partner_prospect'));

alter table if exists public.transaction_participants drop constraint if exists transaction_participants_assignment_source_check;
alter table if exists public.transaction_participants
  add constraint transaction_participants_assignment_source_check
  check (assignment_source in ('transaction_direct', 'development_default', 'system_inherited', 'reference_only', 'partner_invitation', 'partner_prospect'));

create table if not exists public.partner_prospect_events (
  id uuid primary key default gen_random_uuid(),
  partner_prospect_id uuid not null references public.partner_prospects(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  invitation_id uuid references public.transaction_partner_invitations(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists partner_prospect_events_prospect_idx
  on public.partner_prospect_events (partner_prospect_id, created_at desc);
create index if not exists partner_prospect_events_transaction_idx
  on public.partner_prospect_events (transaction_id, created_at desc);

create or replace function public.bridge_partner_prospect_key(p_value text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(p_value, ''))), '\b(incorporated|inc|attorneys|attorney|conveyancers|conveyancer|pty|ltd|limited)\b', '', 'g'),
      '[^a-z0-9]+',
      '',
      'g'
    ),
    ''
  )
$$;

create or replace function public.bridge_partner_prospect_role(p_role_type text)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_role_type, ''))) in ('transfer_attorney', 'bond_attorney', 'attorney', 'conveyancer', 'conveyancing_secretary') then 'attorney'
    when lower(trim(coalesce(p_role_type, ''))) in ('bond_originator', 'originator', 'bond') then 'bond_originator'
    when lower(trim(coalesce(p_role_type, ''))) in ('developer', 'developer_contact') then 'developer'
    else 'other'
  end
$$;

create or replace function public.bridge_log_partner_prospect_event(
  p_partner_prospect_id uuid,
  p_transaction_id uuid,
  p_invitation_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_event_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_partner_prospect_id is null then
    return;
  end if;

  insert into public.partner_prospect_events (
    partner_prospect_id,
    transaction_id,
    invitation_id,
    event_type,
    event_data,
    created_by
  )
  values (
    p_partner_prospect_id,
    p_transaction_id,
    p_invitation_id,
    p_event_type,
    coalesce(p_event_data, '{}'::jsonb),
    p_actor_user_id
  );
exception
  when undefined_table or undefined_column or insufficient_privilege then
    return;
end;
$$;

create or replace function public.bridge_upsert_partner_prospect_for_invitation(
  p_transaction_id uuid,
  p_invitation_id uuid,
  p_role_type text,
  p_company_name text,
  p_contact_name text default null,
  p_email text default null,
  p_phone text default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_type text := public.bridge_partner_prospect_role(p_role_type);
  v_company_name text := nullif(trim(coalesce(p_company_name, '')), '');
  v_company_key text := public.bridge_partner_prospect_key(p_company_name);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_actor uuid := coalesce(p_actor_user_id, auth.uid());
  v_now timestamptz := now();
  v_existing public.partner_prospects%rowtype;
  v_duplicate_id uuid;
  v_event_type text := 'Prospect Updated';
  v_previous_status text;
begin
  if v_company_name is null then
    raise exception 'Partner prospect company name is required.';
  end if;

  if v_company_key is null then
    v_company_key := lower(regexp_replace(v_company_name, '[^a-z0-9]+', '', 'g'));
  end if;

  select *
  into v_existing
  from public.partner_prospects
  where role_type = v_role_type
    and (
      company_key = v_company_key
      or (v_email is not null and email_key = v_email)
    )
  order by
    case when company_key = v_company_key then 0 else 1 end,
    created_at asc
  limit 1
  for update;

  if v_existing.id is null then
    select id
    into v_duplicate_id
    from public.partner_prospects
    where role_type = v_role_type
      and id <> coalesce(v_existing.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and (
        company_key like '%' || v_company_key || '%'
        or v_company_key like '%' || company_key || '%'
      )
    order by created_at asc
    limit 1;

    insert into public.partner_prospects (
      role_type,
      company_name,
      company_key,
      contact_name,
      email,
      email_key,
      phone,
      status,
      first_invited_at,
      last_invited_at,
      last_invitation_date,
      invitation_count,
      transaction_count,
      last_transaction_date,
      possible_duplicate_of,
      duplicate_review_status,
      created_by
    )
    values (
      v_role_type,
      v_company_name,
      v_company_key,
      nullif(trim(coalesce(p_contact_name, '')), ''),
      v_email,
      v_email,
      nullif(trim(coalesce(p_phone, '')), ''),
      'invited',
      v_now,
      v_now,
      v_now,
      1,
      case when p_transaction_id is null then 0 else 1 end,
      case when p_transaction_id is null then null else v_now end,
      v_duplicate_id,
      case when v_duplicate_id is null then 'none' else 'possible_duplicate' end,
      v_actor
    )
    returning * into v_existing;

    v_event_type := 'Prospect Created';
  else
    v_previous_status := v_existing.status;

    update public.partner_prospects
    set contact_name = coalesce(nullif(trim(coalesce(p_contact_name, '')), ''), contact_name),
        email = coalesce(v_email, email),
        email_key = coalesce(v_email, email_key),
        phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
        status = case when status in ('inactive', 'declined') then 'invited' else status end,
        first_invited_at = coalesce(first_invited_at, v_now),
        last_invited_at = v_now,
        last_invitation_date = v_now,
        invitation_count = invitation_count + 1,
        transaction_count = transaction_count + case when p_transaction_id is null then 0 else 1 end,
        last_transaction_date = case when p_transaction_id is null then last_transaction_date else v_now end,
        updated_at = v_now
    where id = v_existing.id
    returning * into v_existing;

    v_event_type := case
      when v_previous_status in ('inactive', 'declined') then 'Prospect Reactivated'
      when v_existing.status = 'invited' then 'Invitation Reused'
      else 'Prospect Updated'
    end;
  end if;

  if p_invitation_id is not null then
    update public.transaction_partner_invitations
    set partner_prospect_id = v_existing.id
    where id = p_invitation_id;
  end if;

  perform public.bridge_log_partner_prospect_event(
    v_existing.id,
    p_transaction_id,
    p_invitation_id,
    v_event_type,
    v_actor,
    jsonb_build_object(
      'roleType', p_role_type,
      'prospectRoleType', v_role_type,
      'companyName', v_company_name,
      'email', v_email,
      'invitationCount', v_existing.invitation_count,
      'transactionCount', v_existing.transaction_count
    )
  );

  return jsonb_build_object(
    'success', true,
    'prospect', to_jsonb(v_existing),
    'eventType', v_event_type
  );
end;
$$;

create or replace function public.bridge_use_partner_prospect_on_transaction(
  p_transaction_id uuid,
  p_partner_prospect_id uuid,
  p_role_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prospect public.partner_prospects%rowtype;
  v_role_type text;
  v_invite_role text;
  v_shape record;
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_access_id uuid;
  v_participant_id uuid;
begin
  select *
  into v_prospect
  from public.partner_prospects
  where id = p_partner_prospect_id
  for update;

  if v_prospect.id is null then
    return jsonb_build_object('success', false, 'code', 'prospect_not_found');
  end if;

  v_role_type := coalesce(public.bridge_partner_prospect_role(p_role_type), v_prospect.role_type);
  v_invite_role := case
    when v_role_type = 'attorney' then 'transfer_attorney'
    when v_role_type = 'bond_originator' then 'bond_originator'
    when v_role_type = 'developer' then 'developer'
    else 'other'
  end;

  update public.partner_prospects
  set transaction_count = transaction_count + 1,
      last_transaction_date = v_now,
      updated_at = v_now
  where id = v_prospect.id
  returning * into v_prospect;

  select *
  into v_shape
  from public.bridge_transaction_partner_invite_role_shape(v_invite_role)
  limit 1;

  if v_prospect.status = 'joined' and v_prospect.bridge_user_id is not null then
    insert into public.transaction_user_access (
      transaction_id,
      user_id,
      access_role
    )
    values (
      p_transaction_id,
      v_prospect.bridge_user_id,
      v_invite_role
    )
    on conflict (transaction_id, user_id, access_role) do update
    set updated_at = v_now
    returning id into v_access_id;

    insert into public.transaction_participants (
      transaction_id,
      user_id,
      role_type,
      legal_role,
      transaction_role,
      status,
      participant_name,
      participant_email,
      invited_by_user_id,
      invited_at,
      accepted_at,
      visibility_scope,
      is_internal,
      participant_scope,
      assignment_source,
      partner_prospect_id,
      can_view,
      can_comment,
      can_upload_documents,
      can_edit_finance_workflow,
      can_edit_attorney_workflow,
      can_edit_core_transaction
    )
    values (
      p_transaction_id,
      v_prospect.bridge_user_id,
      v_shape.role_type,
      v_shape.legal_role,
      v_shape.transaction_role,
      'active',
      coalesce(v_prospect.contact_name, v_prospect.company_name),
      v_prospect.email,
      v_actor,
      v_now,
      v_now,
      'shared',
      false,
      'transaction',
      'partner_prospect',
      v_prospect.id,
      true,
      true,
      true,
      v_invite_role = 'bond_originator',
      v_invite_role = 'transfer_attorney',
      false
    )
    on conflict (transaction_id, role_type, legal_role) do update
    set user_id = excluded.user_id,
        status = 'active',
        participant_name = excluded.participant_name,
        participant_email = excluded.participant_email,
        accepted_at = excluded.accepted_at,
        assignment_source = excluded.assignment_source,
        partner_prospect_id = excluded.partner_prospect_id,
        updated_at = v_now
    returning id into v_participant_id;
  end if;

  insert into public.transaction_role_players (
    transaction_id,
    role_type,
    selection_source,
    partner_prospect_id,
    partner_name,
    contact_person,
    email_address,
    phone_number,
    status,
    assignment_status,
    user_id,
    assigned_user_id,
    assigned_by,
    snapshot_json,
    created_at,
    updated_at
  )
  values (
    p_transaction_id,
    v_shape.transaction_role,
    'partner_prospect',
    v_prospect.id,
    v_prospect.company_name,
    v_prospect.contact_name,
    v_prospect.email,
    v_prospect.phone,
    case when v_prospect.bridge_user_id is null then 'pending' else 'active' end,
    case when v_prospect.bridge_user_id is null then 'pending_acceptance' else 'active' end,
    v_prospect.bridge_user_id,
    v_prospect.bridge_user_id,
    v_actor,
    jsonb_build_object(
      'source', 'partner_prospect',
      'partnerProspectId', v_prospect.id,
      'roleType', v_invite_role,
      'prospectStatus', v_prospect.status
    ),
    v_now,
    v_now
  )
  on conflict (transaction_id, role_type) where removed_at is null do update
  set selection_source = excluded.selection_source,
      partner_prospect_id = excluded.partner_prospect_id,
      partner_name = excluded.partner_name,
      contact_person = excluded.contact_person,
      email_address = excluded.email_address,
      phone_number = excluded.phone_number,
      status = excluded.status,
      assignment_status = excluded.assignment_status,
      user_id = excluded.user_id,
      assigned_user_id = excluded.assigned_user_id,
      assigned_by = excluded.assigned_by,
      snapshot_json = excluded.snapshot_json,
      updated_at = v_now;

  perform public.bridge_log_partner_prospect_event(
    v_prospect.id,
    p_transaction_id,
    null,
    'Partner Used Again',
    v_actor,
    jsonb_build_object(
      'roleType', v_invite_role,
      'status', v_prospect.status,
      'accessGranted', v_access_id is not null
    )
  );

  perform public.bridge_log_transaction_partner_invitation_event(
    p_transaction_id,
    'Existing Prospect Reused',
    v_actor,
    jsonb_build_object(
      'partnerProspectId', v_prospect.id,
      'companyName', v_prospect.company_name,
      'roleType', v_invite_role,
      'accessId', v_access_id,
      'participantId', v_participant_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'partnerProspectId', v_prospect.id,
    'accessId', v_access_id,
    'participantId', v_participant_id,
    'accessGranted', v_access_id is not null
  );
end;
$$;

create or replace function public.bridge_partner_prospect_invitation_status_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.partner_prospect_id is null then
    return new;
  end if;

  if new.status = 'accepted' and old.status is distinct from new.status then
    update public.partner_prospects
    set status = 'joined',
        bridge_user_id = new.accepted_user_id,
        joined_at = coalesce(new.accepted_at, now()),
        accepted_invitation_count = accepted_invitation_count + 1,
        updated_at = now()
    where id = new.partner_prospect_id;

    perform public.bridge_log_partner_prospect_event(
      new.partner_prospect_id,
      new.transaction_id,
      new.id,
      'Prospect Converted',
      new.accepted_user_id,
      jsonb_build_object(
        'companyName', new.company_name,
        'acceptedUserId', new.accepted_user_id,
        'roleType', new.role_type
      )
    );
  elsif new.status = 'declined' and old.status is distinct from new.status then
    update public.partner_prospects
    set status = case when status = 'joined' then status else 'declined' end,
        declined_invitation_count = declined_invitation_count + 1,
        updated_at = now()
    where id = new.partner_prospect_id;

    perform public.bridge_log_partner_prospect_event(
      new.partner_prospect_id,
      new.transaction_id,
      new.id,
      'Prospect Declined',
      new.invited_by_user_id,
      jsonb_build_object('companyName', new.company_name, 'roleType', new.role_type)
    );
  elsif new.status = 'expired' and old.status is distinct from new.status then
    perform public.bridge_log_partner_prospect_event(
      new.partner_prospect_id,
      new.transaction_id,
      new.id,
      'Invitation Expired',
      new.invited_by_user_id,
      jsonb_build_object('companyName', new.company_name, 'roleType', new.role_type)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists transaction_partner_invitations_partner_prospect_sync on public.transaction_partner_invitations;
create trigger transaction_partner_invitations_partner_prospect_sync
after update of status on public.transaction_partner_invitations
for each row execute function public.bridge_partner_prospect_invitation_status_sync();

drop trigger if exists partner_prospects_touch_updated_at on public.partner_prospects;
create trigger partner_prospects_touch_updated_at
before update on public.partner_prospects
for each row execute function public.bridge_touch_updated_at();

grant select on public.partner_prospects to authenticated;
grant select on public.partner_prospect_events to authenticated;
grant execute on function public.bridge_upsert_partner_prospect_for_invitation(uuid, uuid, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.bridge_use_partner_prospect_on_transaction(uuid, uuid, text) to authenticated;

alter table public.partner_prospects enable row level security;
alter table public.partner_prospect_events enable row level security;

drop policy if exists partner_prospects_select_authenticated on public.partner_prospects;
create policy partner_prospects_select_authenticated
on public.partner_prospects
for select
to authenticated
using (true);

drop policy if exists partner_prospect_events_select_authenticated on public.partner_prospect_events;
create policy partner_prospect_events_select_authenticated
on public.partner_prospect_events
for select
to authenticated
using (true);
