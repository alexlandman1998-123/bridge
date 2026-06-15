create extension if not exists "pgcrypto";

create table if not exists public.transaction_partner_invitations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  role_type text not null,
  company_name text not null,
  contact_name text,
  email text not null,
  phone text,
  status text not null default 'pending',
  invited_by_user_id uuid references auth.users(id) on delete set null,
  accepted_user_id uuid references auth.users(id) on delete set null,
  invitation_token uuid unique default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  viewed_at timestamptz,
  declined_at timestamptz,
  accepted_at timestamptz,
  resent_at timestamptz,
  reminder_3d_sent_at timestamptz,
  reminder_7d_sent_at timestamptz,
  reminder_14d_sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_partner_invitations_role_type_check
    check (role_type in ('transfer_attorney', 'bond_originator', 'developer', 'other')),
  constraint transaction_partner_invitations_status_check
    check (status in ('pending', 'accepted', 'declined', 'expired'))
);

alter table if exists public.transaction_partner_invitations
  add column if not exists transaction_id uuid references public.transactions(id) on delete cascade;
alter table if exists public.transaction_partner_invitations
  add column if not exists role_type text;
alter table if exists public.transaction_partner_invitations
  add column if not exists company_name text;
alter table if exists public.transaction_partner_invitations
  add column if not exists contact_name text;
alter table if exists public.transaction_partner_invitations
  add column if not exists email text;
alter table if exists public.transaction_partner_invitations
  add column if not exists phone text;
alter table if exists public.transaction_partner_invitations
  add column if not exists status text not null default 'pending';
alter table if exists public.transaction_partner_invitations
  add column if not exists invited_by_user_id uuid references auth.users(id) on delete set null;
alter table if exists public.transaction_partner_invitations
  add column if not exists accepted_user_id uuid references auth.users(id) on delete set null;
alter table if exists public.transaction_partner_invitations
  add column if not exists invitation_token uuid unique default gen_random_uuid();
alter table if exists public.transaction_partner_invitations
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days');
alter table if exists public.transaction_partner_invitations
  add column if not exists viewed_at timestamptz;
alter table if exists public.transaction_partner_invitations
  add column if not exists declined_at timestamptz;
alter table if exists public.transaction_partner_invitations
  add column if not exists accepted_at timestamptz;
alter table if exists public.transaction_partner_invitations
  add column if not exists resent_at timestamptz;
alter table if exists public.transaction_partner_invitations
  add column if not exists reminder_3d_sent_at timestamptz;
alter table if exists public.transaction_partner_invitations
  add column if not exists reminder_7d_sent_at timestamptz;
alter table if exists public.transaction_partner_invitations
  add column if not exists reminder_14d_sent_at timestamptz;
alter table if exists public.transaction_partner_invitations
  add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists public.transaction_partner_invitations
  add column if not exists created_at timestamptz not null default now();
alter table if exists public.transaction_partner_invitations
  add column if not exists updated_at timestamptz not null default now();

create index if not exists transaction_partner_invitations_transaction_idx
  on public.transaction_partner_invitations (transaction_id, status);
create index if not exists transaction_partner_invitations_email_idx
  on public.transaction_partner_invitations (lower(email), status);
create index if not exists transaction_partner_invitations_expires_idx
  on public.transaction_partner_invitations (expires_at)
  where status = 'pending';

create table if not exists public.transaction_user_access (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_role text not null,
  created_by_invitation_id uuid references public.transaction_partner_invitations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_user_access_access_role_check
    check (access_role in ('transfer_attorney', 'bond_originator', 'developer', 'other')),
  unique (transaction_id, user_id, access_role)
);

create index if not exists transaction_user_access_transaction_idx
  on public.transaction_user_access (transaction_id);
create index if not exists transaction_user_access_user_idx
  on public.transaction_user_access (user_id);

alter table if exists public.transaction_role_players
  add column if not exists transaction_partner_invitation_id uuid references public.transaction_partner_invitations(id) on delete set null;
alter table if exists public.transaction_participants
  add column if not exists transaction_partner_invitation_id uuid references public.transaction_partner_invitations(id) on delete set null;

alter table if exists public.transaction_role_players drop constraint if exists transaction_role_players_role_type_check;
alter table if exists public.transaction_role_players
  add constraint transaction_role_players_role_type_check
  check (role_type in ('bond_originator', 'bond_attorney', 'transfer_attorney', 'cancellation_attorney', 'developer_contact', 'agent', 'other'));

alter table if exists public.transaction_role_players drop constraint if exists transaction_role_players_selection_source_check;
alter table if exists public.transaction_role_players
  add constraint transaction_role_players_selection_source_check
  check (selection_source in ('agency_preferred', 'buyer_appointed', 'manual', 'connected_partner', 'preferred_partner', 'recently_used', 'invited_partner'));

alter table if exists public.transaction_participants drop constraint if exists transaction_participants_assignment_source_check;
alter table if exists public.transaction_participants
  add constraint transaction_participants_assignment_source_check
  check (
    assignment_source in (
      'transaction_direct',
      'development_default',
      'system_inherited',
      'reference_only',
      'partner_invitation',
      'attorney_assignment',
      'dalawyer_demo_seed'
    )
  );

create or replace function public.bridge_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists transaction_partner_invitations_touch_updated_at on public.transaction_partner_invitations;
create trigger transaction_partner_invitations_touch_updated_at
before update on public.transaction_partner_invitations
for each row execute function public.bridge_touch_updated_at();

drop trigger if exists transaction_user_access_touch_updated_at on public.transaction_user_access;
create trigger transaction_user_access_touch_updated_at
before update on public.transaction_user_access
for each row execute function public.bridge_touch_updated_at();

create or replace function public.bridge_transaction_partner_invite_role_shape(p_role_type text)
returns table(role_type text, legal_role text, transaction_role text, profile_role text, role_label text)
language sql
stable
as $$
  select
    case
      when p_role_type = 'transfer_attorney' then 'attorney'
      when p_role_type = 'bond_originator' then 'bond_originator'
      when p_role_type = 'developer' then 'developer'
      else 'external_collaborator'
    end,
    case when p_role_type = 'transfer_attorney' then 'transfer' else 'none' end,
    case
      when p_role_type = 'transfer_attorney' then 'transfer_attorney'
      when p_role_type = 'bond_originator' then 'bond_originator'
      when p_role_type = 'developer' then 'developer_contact'
      else 'external_collaborator'
    end,
    case
      when p_role_type = 'transfer_attorney' then 'attorney'
      when p_role_type = 'bond_originator' then 'bond_originator'
      when p_role_type = 'developer' then 'developer'
      else 'viewer'
    end,
    case
      when p_role_type = 'transfer_attorney' then 'Transfer Attorney'
      when p_role_type = 'bond_originator' then 'Bond Originator'
      when p_role_type = 'developer' then 'Developer'
      else 'Transaction Partner'
    end
$$;

create or replace function public.bridge_log_transaction_partner_invitation_event(
  p_transaction_id uuid,
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
  if p_transaction_id is null then
    return;
  end if;

  insert into public.transaction_events (
    transaction_id,
    event_type,
    event_data,
    created_by,
    created_by_role
  )
  values (
    p_transaction_id,
    p_event_type,
    coalesce(p_event_data, '{}'::jsonb),
    p_actor_user_id,
    'system'
  );
exception
  when undefined_table or undefined_column or insufficient_privilege then
    return;
end;
$$;

create or replace function public.bridge_get_transaction_partner_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_invite public.transaction_partner_invitations%rowtype;
  v_tx public.transactions%rowtype;
  v_org_name text := '';
  v_property text := '';
  v_result jsonb;
begin
  begin
    v_token := nullif(trim(p_token), '')::uuid;
  exception
    when invalid_text_representation then
      return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end;

  if v_token is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_token');
  end if;

  select *
  into v_invite
  from public.transaction_partner_invitations
  where invitation_token = v_token
  limit 1;

  if v_invite.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_invite.status = 'pending' and v_invite.expires_at < now() then
    update public.transaction_partner_invitations
    set status = 'expired', invitation_token = null
    where id = v_invite.id;

    perform public.bridge_log_transaction_partner_invitation_event(
      v_invite.transaction_id,
      'Invitation Expired',
      v_invite.invited_by_user_id,
      jsonb_build_object(
        'invitationId', v_invite.id,
        'roleType', v_invite.role_type,
        'companyName', v_invite.company_name,
        'email', v_invite.email
      )
    );

    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if v_invite.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', v_invite.status);
  end if;

  select *
  into v_tx
  from public.transactions
  where id = v_invite.transaction_id
  limit 1;

  if v_invite.viewed_at is null then
    update public.transaction_partner_invitations
    set viewed_at = now()
    where id = v_invite.id;

    perform public.bridge_log_transaction_partner_invitation_event(
      v_invite.transaction_id,
      'Invitation Viewed',
      null,
      jsonb_build_object(
        'invitationId', v_invite.id,
        'roleType', v_invite.role_type,
        'companyName', v_invite.company_name,
        'contactName', v_invite.contact_name,
        'email', v_invite.email
      )
    );
  end if;

  begin
    select coalesce(nullif(display_name, ''), nullif(name, ''), '')
    into v_org_name
    from public.organisations
    where id = v_tx.organisation_id
    limit 1;
  exception
    when undefined_table or undefined_column then
      v_org_name := '';
  end;

  v_property := concat_ws(', ',
    nullif(v_tx.property_address_line_1, ''),
    nullif(v_tx.suburb, ''),
    nullif(v_tx.city, '')
  );

  v_result := jsonb_build_object(
    'ok', true,
    'invitation', jsonb_build_object(
      'id', v_invite.id,
      'transactionId', v_invite.transaction_id,
      'roleType', v_invite.role_type,
      'companyName', v_invite.company_name,
      'contactName', v_invite.contact_name,
      'email', v_invite.email,
      'phone', v_invite.phone,
      'status', v_invite.status,
      'expiresAt', v_invite.expires_at,
      'createdAt', v_invite.created_at,
      'invitedByOrganisation', coalesce(nullif(v_org_name, ''), 'Bridge'),
      'transactionReference', coalesce(v_tx.transaction_reference, v_tx.matter_number, v_invite.transaction_id::text),
      'propertyLabel', coalesce(nullif(v_property, ''), v_tx.property_description, 'Property transaction')
    )
  );

  return v_result;
end;
$$;

create or replace function public.bridge_accept_transaction_partner_invitation(
  p_token text,
  p_profile jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_now timestamptz := now();
  v_invite public.transaction_partner_invitations%rowtype;
  v_shape record;
  v_profile_role text;
  v_first_name text;
  v_last_name text;
  v_full_name text;
  v_phone text;
  v_access_id uuid;
  v_participant_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated');
  end if;

  begin
    v_token := nullif(trim(p_token), '')::uuid;
  exception
    when invalid_text_representation then
      return jsonb_build_object('success', false, 'code', 'invalid_token');
  end;

  select *
  into v_invite
  from public.transaction_partner_invitations
  where invitation_token = v_token
  for update;

  if v_invite.id is null then
    return jsonb_build_object('success', false, 'code', 'invitation_not_found');
  end if;

  if v_invite.status <> 'pending' then
    return jsonb_build_object('success', false, 'code', 'invitation_' || v_invite.status);
  end if;

  if v_invite.expires_at < v_now then
    update public.transaction_partner_invitations
    set status = 'expired', invitation_token = null
    where id = v_invite.id;
    return jsonb_build_object('success', false, 'code', 'invitation_expired');
  end if;

  if v_invite.email is not null and v_email <> '' and lower(v_invite.email) <> v_email then
    return jsonb_build_object(
      'success', false,
      'code', 'email_mismatch',
      'expectedEmail', lower(v_invite.email),
      'actualEmail', v_email
    );
  end if;

  select *
  into v_shape
  from public.bridge_transaction_partner_invite_role_shape(v_invite.role_type)
  limit 1;

  v_profile_role := coalesce(nullif(p_profile ->> 'role', ''), v_shape.profile_role);
  if v_profile_role not in ('viewer', 'agent', 'developer', 'attorney', 'bond_originator', 'client') then
    v_profile_role := v_shape.profile_role;
  end if;

  v_first_name := nullif(trim(coalesce(p_profile ->> 'firstName', p_profile ->> 'first_name', '')), '');
  v_last_name := nullif(trim(coalesce(p_profile ->> 'lastName', p_profile ->> 'last_name', '')), '');
  v_full_name := nullif(trim(coalesce(p_profile ->> 'fullName', p_profile ->> 'full_name', concat_ws(' ', v_first_name, v_last_name), v_invite.contact_name)), '');
  v_phone := nullif(trim(coalesce(p_profile ->> 'mobileNumber', p_profile ->> 'mobile_number', p_profile ->> 'phone', v_invite.phone)), '');

  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    full_name,
    company_name,
    phone_number,
    role,
    onboarding_completed
  )
  values (
    v_user_id,
    coalesce(nullif(v_email, ''), lower(v_invite.email)),
    v_first_name,
    v_last_name,
    v_full_name,
    v_invite.company_name,
    v_phone,
    v_profile_role,
    true
  )
  on conflict (id) do update
  set email = coalesce(public.profiles.email, excluded.email),
      first_name = coalesce(nullif(excluded.first_name, ''), public.profiles.first_name),
      last_name = coalesce(nullif(excluded.last_name, ''), public.profiles.last_name),
      full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
      company_name = coalesce(nullif(excluded.company_name, ''), public.profiles.company_name),
      phone_number = coalesce(nullif(excluded.phone_number, ''), public.profiles.phone_number),
      role = excluded.role,
      onboarding_completed = true,
      updated_at = v_now;

  insert into public.transaction_user_access (
    transaction_id,
    user_id,
    access_role,
    created_by_invitation_id
  )
  values (
    v_invite.transaction_id,
    v_user_id,
    v_invite.role_type,
    v_invite.id
  )
  on conflict (transaction_id, user_id, access_role) do update
  set created_by_invitation_id = excluded.created_by_invitation_id,
      updated_at = v_now
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
    transaction_partner_invitation_id,
    can_view,
    can_comment,
    can_upload_documents,
    can_edit_finance_workflow,
    can_edit_attorney_workflow,
    can_edit_core_transaction
  )
  values (
    v_invite.transaction_id,
    v_user_id,
    v_shape.role_type,
    v_shape.legal_role,
    v_shape.transaction_role,
    'active',
    coalesce(v_full_name, v_invite.contact_name, v_invite.company_name),
    coalesce(nullif(v_email, ''), lower(v_invite.email)),
    v_invite.invited_by_user_id,
    coalesce(v_invite.created_at, v_now),
    v_now,
    'shared',
    false,
    'transaction',
    'partner_invitation',
    v_invite.id,
    true,
    true,
    true,
    v_invite.role_type = 'bond_originator',
    v_invite.role_type = 'transfer_attorney',
    false
  )
  on conflict (transaction_id, role_type, legal_role) do update
  set user_id = excluded.user_id,
      status = 'active',
      participant_name = excluded.participant_name,
      participant_email = excluded.participant_email,
      accepted_at = excluded.accepted_at,
      transaction_role = excluded.transaction_role,
      transaction_partner_invitation_id = excluded.transaction_partner_invitation_id,
      updated_at = v_now
  returning id into v_participant_id;

  update public.transaction_role_players
  set user_id = v_user_id,
      assigned_user_id = v_user_id,
      contact_person = coalesce(contact_person, v_full_name, v_invite.contact_name),
      email_address = coalesce(nullif(v_email, ''), lower(v_invite.email)),
      status = 'active',
      assignment_status = 'active',
      activation_trigger = 'invitation_accepted',
      activated_at = v_now,
      transaction_partner_invitation_id = v_invite.id,
      updated_at = v_now
  where transaction_id = v_invite.transaction_id
    and role_type = v_shape.transaction_role
    and (
      transaction_partner_invitation_id = v_invite.id
      or lower(coalesce(email_address, '')) = lower(v_invite.email)
    );

  update public.transaction_partner_invitations
  set status = 'accepted',
      accepted_user_id = v_user_id,
      accepted_at = v_now,
      invitation_token = null
  where id = v_invite.id;

  perform public.bridge_log_transaction_partner_invitation_event(
    v_invite.transaction_id,
    'Invitation Accepted',
    v_user_id,
    jsonb_build_object(
      'invitationId', v_invite.id,
      'accessId', v_access_id,
      'participantId', v_participant_id,
      'roleType', v_invite.role_type,
      'companyName', v_invite.company_name,
      'contactName', coalesce(v_full_name, v_invite.contact_name),
      'email', coalesce(nullif(v_email, ''), lower(v_invite.email))
    )
  );

  return jsonb_build_object(
    'success', true,
    'transactionId', v_invite.transaction_id,
    'invitationId', v_invite.id,
    'accessId', v_access_id,
    'participantId', v_participant_id,
    'roleType', v_invite.role_type,
    'roleLabel', v_shape.role_label
  );
end;
$$;

create or replace function public.bridge_decline_transaction_partner_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_invite public.transaction_partner_invitations%rowtype;
begin
  begin
    v_token := nullif(trim(p_token), '')::uuid;
  exception
    when invalid_text_representation then
      return jsonb_build_object('success', false, 'code', 'invalid_token');
  end;

  select *
  into v_invite
  from public.transaction_partner_invitations
  where invitation_token = v_token
  for update;

  if v_invite.id is null then
    return jsonb_build_object('success', false, 'code', 'invitation_not_found');
  end if;

  if v_invite.status <> 'pending' then
    return jsonb_build_object('success', false, 'code', 'invitation_' || v_invite.status);
  end if;

  update public.transaction_partner_invitations
  set status = 'declined',
      declined_at = now(),
      invitation_token = null
  where id = v_invite.id;

  perform public.bridge_log_transaction_partner_invitation_event(
    v_invite.transaction_id,
    'Invitation Declined',
    null,
    jsonb_build_object(
      'invitationId', v_invite.id,
      'roleType', v_invite.role_type,
      'companyName', v_invite.company_name,
      'email', v_invite.email
    )
  );

  return jsonb_build_object('success', true, 'transactionId', v_invite.transaction_id);
end;
$$;

create or replace function public.bridge_resend_transaction_partner_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.transaction_partner_invitations%rowtype;
  v_token uuid := gen_random_uuid();
begin
  select *
  into v_invite
  from public.transaction_partner_invitations
  where id = p_invitation_id
  for update;

  if v_invite.id is null then
    return jsonb_build_object('success', false, 'code', 'invitation_not_found');
  end if;

  if not public.bridge_can_access_transaction_spine(v_invite.transaction_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  update public.transaction_partner_invitations
  set status = 'pending',
      invitation_token = v_token,
      expires_at = now() + interval '30 days',
      resent_at = now(),
      declined_at = null,
      accepted_at = null,
      accepted_user_id = null
  where id = v_invite.id;

  perform public.bridge_log_transaction_partner_invitation_event(
    v_invite.transaction_id,
    'Invitation Resent',
    auth.uid(),
    jsonb_build_object(
      'invitationId', v_invite.id,
      'roleType', v_invite.role_type,
      'companyName', v_invite.company_name,
      'email', v_invite.email
    )
  );

  return jsonb_build_object(
    'success', true,
    'invitationId', v_invite.id,
    'token', v_token,
    'expiresAt', now() + interval '30 days'
  );
end;
$$;

alter table public.transaction_partner_invitations enable row level security;
alter table public.transaction_user_access enable row level security;

drop policy if exists transaction_partner_invitations_select_scoped on public.transaction_partner_invitations;
create policy transaction_partner_invitations_select_scoped
on public.transaction_partner_invitations
for select
to authenticated
using (
  public.bridge_can_access_transaction_spine(transaction_id)
  or accepted_user_id = auth.uid()
  or invited_by_user_id = auth.uid()
);

drop policy if exists transaction_partner_invitations_insert_scoped on public.transaction_partner_invitations;
create policy transaction_partner_invitations_insert_scoped
on public.transaction_partner_invitations
for insert
to authenticated
with check (
  public.bridge_can_access_transaction_spine(transaction_id)
  and (invited_by_user_id is null or invited_by_user_id = auth.uid())
);

drop policy if exists transaction_partner_invitations_update_scoped on public.transaction_partner_invitations;
create policy transaction_partner_invitations_update_scoped
on public.transaction_partner_invitations
for update
to authenticated
using (public.bridge_can_access_transaction_spine(transaction_id) or invited_by_user_id = auth.uid())
with check (public.bridge_can_access_transaction_spine(transaction_id) or invited_by_user_id = auth.uid());

drop policy if exists transaction_user_access_select_scoped on public.transaction_user_access;
create policy transaction_user_access_select_scoped
on public.transaction_user_access
for select
to authenticated
using (
  user_id = auth.uid()
  or public.bridge_can_access_transaction_spine(transaction_id)
);

drop policy if exists transaction_user_access_insert_scoped on public.transaction_user_access;
create policy transaction_user_access_insert_scoped
on public.transaction_user_access
for insert
to authenticated
with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_user_access_update_scoped on public.transaction_user_access;
create policy transaction_user_access_update_scoped
on public.transaction_user_access
for update
to authenticated
using (public.bridge_can_access_transaction_spine(transaction_id))
with check (public.bridge_can_access_transaction_spine(transaction_id));

create or replace function public.bridge_can_access_transaction_spine(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with tx as (
    select *
    from public.transactions t
    where t.id = target_transaction_id
  )
  select coalesce((
    select
      auth.uid() is not null
      and (
        public.bridge_transaction_scope_is_internal_user()
        or tx.owner_user_id = auth.uid()
        or tx.assigned_user_id = auth.uid()
        or tx.created_by = auth.uid()
        or lower(coalesce(tx.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or lower(coalesce(tx.assigned_attorney_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or lower(coalesce(tx.assigned_bond_originator_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or exists (
          select 1
          from public.transaction_user_access tua
          where tua.transaction_id = target_transaction_id
            and tua.user_id = auth.uid()
        )
        or public.bridge_support_can_access_record(
          tx.organisation_id,
          tx.assigned_branch_id,
          'transaction',
          tx.owner_user_id,
          tx.assigned_user_id,
          tx.created_by
        )
        or exists (
          select 1
          from public.organisation_users ou
          where ou.organisation_id = tx.organisation_id
            and ou.user_id = auth.uid()
            and coalesce(ou.status, 'active') in ('active', 'accepted')
            and (
              ou.scope_level in ('organisation', 'organization', 'workspace_hq')
              or coalesce(ou.workspace_role, ou.organisation_role, ou.role) in ('owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'manager', 'hq_manager')
              or (ou.scope_level = 'branch' and ou.workspace_unit_id = tx.assigned_branch_id)
            )
        )
        or exists (
          select 1
          from public.transaction_participants tp
          where tp.transaction_id = target_transaction_id
            and coalesce(tp.status, 'active') = 'active'
            and tp.removed_at is null
            and (
              tp.user_id = auth.uid()
              or tp.assigned_user_id = auth.uid()
              or lower(coalesce(tp.participant_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
            )
        )
        or exists (
          select 1
          from public.transaction_role_players trp
          where trp.transaction_id = target_transaction_id
            and coalesce(trp.status, 'active') = 'active'
            and trp.removed_at is null
            and (
              trp.user_id = auth.uid()
              or trp.assigned_user_id = auth.uid()
              or lower(coalesce(trp.email_address, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
            )
        )
        or exists (
          select 1
          from public.transaction_attorney_assignments taa
          where taa.transaction_id = target_transaction_id
            and coalesce(taa.status, 'active') <> 'removed'
            and (
              taa.assigned_user_id = auth.uid()
              or taa.primary_attorney_id = auth.uid()
              or taa.attorney_user_id = auth.uid()
            )
        )
        or exists (
          select 1
          from public.transaction_bond_applications tba
          where tba.transaction_id = target_transaction_id
            and public.bridge_can_access_bond_application_scope(tba.id)
        )
      )
    from tx
  ), false)
$$;

grant execute on function public.bridge_get_transaction_partner_invitation(text) to anon, authenticated;
grant execute on function public.bridge_accept_transaction_partner_invitation(text, jsonb) to authenticated;
grant execute on function public.bridge_decline_transaction_partner_invitation(text) to anon, authenticated;
grant execute on function public.bridge_resend_transaction_partner_invitation(uuid) to authenticated;
grant execute on function public.bridge_can_access_transaction_spine(uuid) to authenticated;
