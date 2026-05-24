begin;

create extension if not exists "pgcrypto";

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  invite_type text not null,
  status text not null default 'pending',
  token text not null default encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz,
  inviter_user_id uuid references auth.users(id) on delete set null,
  target_workspace_id uuid references public.organisations(id) on delete cascade,
  target_workspace_role text,
  target_transaction_id uuid,
  target_transaction_role text,
  target_branch_id uuid references public.organisation_branches(id) on delete set null,
  target_team_id uuid,
  email text,
  phone text,
  invitee_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invites_invite_type_check check (
    invite_type in (
      'workspace_invite',
      'transaction_invite',
      'workspace_and_transaction_invite',
      'branch_invite',
      'team_invite',
      'client_invite',
      'external_collaborator_invite'
    )
  ),
  constraint invites_status_check check (
    status in ('pending', 'accepted', 'declined', 'expired', 'revoked', 'cancelled')
  )
);

create unique index if not exists invites_token_unique_idx
  on public.invites (token);

create index if not exists invites_email_status_idx
  on public.invites (lower(email), status);

create index if not exists invites_workspace_status_idx
  on public.invites (target_workspace_id, status, created_at desc)
  where target_workspace_id is not null;

create index if not exists invites_transaction_status_idx
  on public.invites (target_transaction_id, status, created_at desc)
  where target_transaction_id is not null;

drop trigger if exists invites_set_updated_at on public.invites;
create trigger invites_set_updated_at
before update on public.invites
for each row
execute function public.bridge_set_updated_at();

create table if not exists public.invite_events (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid references public.invites(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.organisations(id) on delete set null,
  transaction_id uuid,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists invite_events_invite_idx
  on public.invite_events (invite_id, created_at desc);

create index if not exists invite_events_user_idx
  on public.invite_events (user_id, created_at desc);

alter table if exists public.transaction_participants
  add column if not exists firm_id uuid,
  add column if not exists invited_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists invitation_token text,
  add column if not exists invitation_expires_at timestamptz,
  add column if not exists invited_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists transaction_role text,
  add column if not exists visibility_scope text,
  add column if not exists is_internal boolean not null default false;

create index if not exists transaction_participants_invitation_token_idx
  on public.transaction_participants (invitation_token)
  where invitation_token is not null;

alter table public.invites enable row level security;
alter table public.invite_events enable row level security;

drop policy if exists invites_select_invitee_or_workspace_admin on public.invites;
create policy invites_select_invitee_or_workspace_admin
  on public.invites
  for select
  to authenticated
  using (
    lower(coalesce(email, '')) = lower(coalesce(auth.jwt()->>'email', ''))
    or inviter_user_id = auth.uid()
    or accepted_by_user_id = auth.uid()
    or exists (
      select 1
      from public.organisation_users ou
      where ou.organisation_id = invites.target_workspace_id
        and ou.user_id = auth.uid()
        and ou.status = 'active'
        and coalesce(ou.workspace_role, ou.organisation_role, ou.role) in ('owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'branch_manager', 'manager')
    )
  );

drop policy if exists invites_insert_workspace_admin on public.invites;
create policy invites_insert_workspace_admin
  on public.invites
  for insert
  to authenticated
  with check (
    inviter_user_id = auth.uid()
    and (
      target_workspace_id is null
      or exists (
        select 1
        from public.organisation_users ou
        where ou.organisation_id = invites.target_workspace_id
          and ou.user_id = auth.uid()
          and ou.status = 'active'
          and coalesce(ou.workspace_role, ou.organisation_role, ou.role) in ('owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'branch_manager', 'manager')
      )
    )
  );

drop policy if exists invites_update_invitee_or_workspace_admin on public.invites;
create policy invites_update_invitee_or_workspace_admin
  on public.invites
  for update
  to authenticated
  using (
    lower(coalesce(email, '')) = lower(coalesce(auth.jwt()->>'email', ''))
    or inviter_user_id = auth.uid()
    or exists (
      select 1
      from public.organisation_users ou
      where ou.organisation_id = invites.target_workspace_id
        and ou.user_id = auth.uid()
        and ou.status = 'active'
        and coalesce(ou.workspace_role, ou.organisation_role, ou.role) in ('owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'branch_manager', 'manager')
    )
  )
  with check (
    lower(coalesce(email, '')) = lower(coalesce(auth.jwt()->>'email', ''))
    or inviter_user_id = auth.uid()
    or accepted_by_user_id = auth.uid()
    or revoked_by_user_id = auth.uid()
  );

drop policy if exists invite_events_select_related on public.invite_events;
create policy invite_events_select_related
  on public.invite_events
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.invites i
      where i.id = invite_events.invite_id
        and (
          i.inviter_user_id = auth.uid()
          or i.accepted_by_user_id = auth.uid()
          or lower(coalesce(i.email, '')) = lower(coalesce(auth.jwt()->>'email', ''))
        )
    )
  );

grant select, insert, update on public.invites to authenticated;
grant select on public.invite_events to authenticated;

create or replace function public.bridge_record_invite_event(
  p_invite_id uuid,
  p_event_type text,
  p_user_id uuid default auth.uid(),
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
begin
  select *
  into v_invite
  from public.invites
  where id = p_invite_id;

  insert into public.invite_events (
    invite_id,
    user_id,
    workspace_id,
    transaction_id,
    event_type,
    metadata
  )
  values (
    p_invite_id,
    p_user_id,
    v_invite.target_workspace_id,
    v_invite.target_transaction_id,
    p_event_type,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.bridge_create_invite(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(payload, '{}'::jsonb);
  v_user_id uuid := auth.uid();
  v_invite_id uuid;
  v_token text := nullif(trim(coalesce(v_payload->>'token', '')), '');
  v_invite_type text := nullif(trim(coalesce(v_payload->>'invite_type', 'workspace_invite')), '');
  v_workspace_id uuid := nullif(v_payload->>'target_workspace_id', '')::uuid;
  v_email text := nullif(lower(trim(coalesce(v_payload->>'email', v_payload->>'invited_email', ''))), '');
  v_workspace_role text := nullif(trim(coalesce(v_payload->>'target_workspace_role', v_payload->>'workspace_role', v_payload->>'organisation_role', '')), '');
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated', 'message', 'Sign in before creating an invite.');
  end if;

  if v_email is null then
    return jsonb_build_object('success', false, 'code', 'missing_email', 'message', 'Invite email is required.');
  end if;

  if v_workspace_id is not null and not exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = v_workspace_id
      and ou.user_id = v_user_id
      and ou.status = 'active'
      and coalesce(ou.workspace_role, ou.organisation_role, ou.role) in ('owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'branch_manager', 'manager')
  ) then
    return jsonb_build_object('success', false, 'code', 'permission_denied', 'message', 'You do not have permission to invite users to this workspace.');
  end if;

  if v_token is not null then
    select id
    into v_invite_id
    from public.invites
    where token = v_token;

    if v_invite_id is not null then
      return jsonb_build_object(
        'success', true,
        'invite_id', v_invite_id,
        'token', v_token,
        'invite_type', v_invite_type,
        'idempotent', true
      );
    end if;
  end if;

  insert into public.invites (
    invite_type,
    status,
    token,
    expires_at,
    inviter_user_id,
    target_workspace_id,
    target_workspace_role,
    target_transaction_id,
    target_transaction_role,
    target_branch_id,
    target_team_id,
    email,
    phone,
    metadata
  )
  values (
    v_invite_type,
    'pending',
    coalesce(v_token, encode(gen_random_bytes(24), 'hex')),
    nullif(v_payload->>'expires_at', '')::timestamptz,
    v_user_id,
    v_workspace_id,
    v_workspace_role,
    nullif(v_payload->>'target_transaction_id', '')::uuid,
    nullif(trim(coalesce(v_payload->>'target_transaction_role', v_payload->>'transaction_role', '')), ''),
    nullif(v_payload->>'target_branch_id', '')::uuid,
    nullif(v_payload->>'target_team_id', '')::uuid,
    v_email,
    nullif(trim(coalesce(v_payload->>'phone', '')), ''),
    coalesce(v_payload->'metadata', '{}'::jsonb)
  )
  returning id, token into v_invite_id, v_token;

  perform public.bridge_record_invite_event(v_invite_id, 'invite_created', v_user_id, jsonb_build_object('invite_type', v_invite_type));

  return jsonb_build_object(
    'success', true,
    'invite_id', v_invite_id,
    'token', v_token,
    'invite_type', v_invite_type
  );
end;
$$;

create or replace function public.bridge_accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_invite public.invites%rowtype;
  v_now timestamptz := now();
  v_membership_id uuid;
  v_participant_id uuid;
  v_workspace_type text;
  v_app_role text;
  v_workspace_role text;
  v_existing_membership public.organisation_users%rowtype;
  v_attorney_firm_id uuid;
  v_attorney_department_id uuid;
  v_attorney_role text;
  v_attorney_member_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated', 'message', 'Sign in before accepting this invite.');
  end if;
  if v_token is null then
    return jsonb_build_object('success', false, 'code', 'missing_token', 'message', 'Invite token is required.');
  end if;

  select *
  into v_invite
  from public.invites
  where token = v_token
  for update;

  if v_invite.id is null then
    return jsonb_build_object('success', false, 'code', 'invite_not_found', 'message', 'Invite not found.');
  end if;

  if v_invite.status <> 'pending' then
    return jsonb_build_object('success', false, 'code', 'invite_' || v_invite.status, 'message', 'Invite is not pending.', 'invite_id', v_invite.id);
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < v_now then
    update public.invites
    set status = 'expired', updated_at = v_now
    where id = v_invite.id;
    perform public.bridge_record_invite_event(v_invite.id, 'invite_expired', v_user_id);
    return jsonb_build_object('success', false, 'code', 'invite_expired', 'message', 'This invite has expired.', 'invite_id', v_invite.id);
  end if;

  if coalesce(v_invite.email, '') <> '' and v_email <> lower(v_invite.email) then
    perform public.bridge_record_invite_event(
      v_invite.id,
      'invite_email_mismatch',
      v_user_id,
      jsonb_build_object('signed_in_email', v_email, 'invited_email', lower(v_invite.email))
    );
    return jsonb_build_object('success', false, 'code', 'invite_email_mismatch', 'message', 'Sign in with the invited email address to accept this invite.', 'invite_id', v_invite.id);
  end if;

  if v_invite.target_workspace_id is not null and v_invite.invite_type in ('workspace_invite', 'workspace_and_transaction_invite', 'branch_invite', 'team_invite') then
    select coalesce(type, 'agency')
    into v_workspace_type
    from public.organisations
    where id = v_invite.target_workspace_id;

    if v_workspace_type is null then
      return jsonb_build_object('success', false, 'code', 'target_workspace_missing', 'message', 'The invited workspace no longer exists.', 'invite_id', v_invite.id);
    end if;

    v_workspace_role := coalesce(nullif(v_invite.target_workspace_role, ''), 'agent');
    v_app_role := case
      when v_workspace_type = 'attorney_firm' then 'attorney'
      when v_workspace_type = 'developer_company' then 'developer'
      when v_workspace_type = 'bond_originator' then 'bond_originator'
      else 'agent'
    end;

    select *
    into v_existing_membership
    from public.organisation_users
    where organisation_id = v_invite.target_workspace_id
      and (user_id = v_user_id or lower(coalesce(email, '')) = v_email)
    order by case when status = 'active' then 0 else 1 end, created_at asc
    limit 1
    for update;

    if v_existing_membership.id is not null then
      update public.organisation_users
      set
        user_id = v_user_id,
        email = v_email,
        role = coalesce(nullif(role, ''), v_workspace_role),
        workspace_role = coalesce(nullif(workspace_role, ''), v_workspace_role),
        organisation_role = coalesce(nullif(organisation_role, ''), v_workspace_role),
        app_role = coalesce(nullif(app_role, ''), v_app_role),
        workspace_type = coalesce(nullif(workspace_type, ''), v_workspace_type),
        branch_id = coalesce(branch_id, v_invite.target_branch_id),
        primary_branch_id = coalesce(primary_branch_id, branch_id, v_invite.target_branch_id),
        status = 'active',
        accepted_at = coalesce(accepted_at, v_now),
        joined_at = coalesce(joined_at, v_now),
        updated_at = v_now
      where id = v_existing_membership.id
      returning id into v_membership_id;
    else
      insert into public.organisation_users (
        organisation_id,
        user_id,
        branch_id,
        primary_branch_id,
        email,
        role,
        workspace_role,
        organisation_role,
        app_role,
        workspace_type,
        status,
        invited_by_user_id,
        invited_at,
        accepted_at,
        joined_at,
        created_by
      )
      values (
        v_invite.target_workspace_id,
        v_user_id,
        v_invite.target_branch_id,
        v_invite.target_branch_id,
        v_email,
        v_workspace_role,
        v_workspace_role,
        v_workspace_role,
        v_app_role,
        v_workspace_type,
        'active',
        v_invite.inviter_user_id,
        v_invite.created_at,
        v_now,
        v_now,
        v_invite.inviter_user_id
      )
      returning id into v_membership_id;
    end if;

    insert into public.user_workspace_preferences (
      user_id,
      active_workspace_id,
      active_workspace_source
    )
    values (
      v_user_id,
      v_invite.target_workspace_id,
      'user_selected'
    )
    on conflict (user_id) do update
    set active_workspace_id = excluded.active_workspace_id,
        active_workspace_source = excluded.active_workspace_source,
        updated_at = now();

    update public.profiles
    set onboarding_completed = true,
        updated_at = now()
    where id = v_user_id;

    insert into public.onboarding_events (
      user_id,
      workspace_id,
      onboarding_step,
      event_type,
      metadata
    )
    values (
      v_user_id,
      v_invite.target_workspace_id,
      'create_or_join_workspace',
      'workspace_invite_accepted',
      jsonb_build_object('invite_id', v_invite.id, 'membership_id', v_membership_id)
    );

    perform public.bridge_record_invite_event(v_invite.id, 'membership_created_from_invite', v_user_id, jsonb_build_object('membership_id', v_membership_id));
  end if;

  if
    v_invite.target_workspace_id is null
    and v_invite.invite_type = 'workspace_invite'
    and coalesce(v_invite.metadata->>'legacy_source', '') = 'attorney_firm_invitations'
  then
    v_attorney_firm_id := nullif(v_invite.metadata->>'attorney_firm_id', '')::uuid;
    v_attorney_department_id := nullif(v_invite.metadata->>'department_id', '')::uuid;
    v_attorney_role := coalesce(nullif(v_invite.target_workspace_role, ''), 'transfer_attorney');

    if v_attorney_firm_id is null or not exists (
      select 1 from public.attorney_firms af where af.id = v_attorney_firm_id and af.is_active = true
    ) then
      return jsonb_build_object('success', false, 'code', 'target_workspace_missing', 'message', 'The invited attorney firm no longer exists.', 'invite_id', v_invite.id);
    end if;

    insert into public.attorney_firm_members (
      firm_id,
      user_id,
      department_id,
      role,
      status,
      invited_by,
      joined_at
    )
    values (
      v_attorney_firm_id,
      v_user_id,
      v_attorney_department_id,
      v_attorney_role,
      'active',
      v_invite.inviter_user_id,
      v_now
    )
    on conflict (firm_id, user_id) do update
    set department_id = coalesce(attorney_firm_members.department_id, excluded.department_id),
        role = coalesce(nullif(attorney_firm_members.role, ''), excluded.role),
        status = 'active',
        invited_by = coalesce(attorney_firm_members.invited_by, excluded.invited_by),
        joined_at = coalesce(attorney_firm_members.joined_at, excluded.joined_at),
        updated_at = v_now
    returning id into v_attorney_member_id;

    update public.attorney_firm_invitations
    set status = 'accepted',
        accepted_at = v_now,
        updated_at = v_now
    where token = v_invite.token;

    update public.profiles
    set primary_attorney_firm_id = coalesce(primary_attorney_firm_id, v_attorney_firm_id),
        attorney_role = coalesce(nullif(attorney_role, ''), v_attorney_role),
        onboarding_completed = true,
        updated_at = v_now
    where id = v_user_id;

    perform public.bridge_record_invite_event(
      v_invite.id,
      'attorney_firm_membership_created_from_invite',
      v_user_id,
      jsonb_build_object('attorney_firm_id', v_attorney_firm_id, 'attorney_member_id', v_attorney_member_id)
    );
  end if;

  if v_invite.target_transaction_id is not null and v_invite.invite_type in ('transaction_invite', 'workspace_and_transaction_invite', 'client_invite', 'external_collaborator_invite') then
    select id
    into v_participant_id
    from public.transaction_participants
    where transaction_id = v_invite.target_transaction_id
      and (
        user_id = v_user_id
        or lower(coalesce(participant_email, '')) = v_email
      )
      and coalesce(role_type, '') = coalesce(nullif(v_invite.target_transaction_role, ''), role_type, '')
    order by created_at asc
    limit 1
    for update;

    if v_participant_id is not null then
      update public.transaction_participants
      set user_id = v_user_id,
          participant_email = v_email,
          status = 'active',
          transaction_role = coalesce(
            transaction_role,
            case
              when coalesce(role_type, v_invite.target_transaction_role) = 'attorney' and legal_role = 'bond' then 'bond_attorney'
              when coalesce(role_type, v_invite.target_transaction_role) = 'attorney' then 'transfer_attorney'
              when coalesce(role_type, v_invite.target_transaction_role) = 'agent' then 'listing_agent'
              when coalesce(role_type, v_invite.target_transaction_role) = 'developer' then 'developer_contact'
              when coalesce(role_type, v_invite.target_transaction_role) = 'bond_originator' then 'bond_originator'
              when coalesce(role_type, v_invite.target_transaction_role) in ('buyer', 'client') then 'buyer'
              when coalesce(role_type, v_invite.target_transaction_role) = 'seller' then 'seller'
              else 'external_collaborator'
            end
          ),
          accepted_at = coalesce(accepted_at, v_now),
          invitation_token = null,
          invitation_expires_at = null,
          updated_at = v_now
      where id = v_participant_id;
    else
      insert into public.transaction_participants (
        transaction_id,
        user_id,
        role_type,
        transaction_role,
        status,
        participant_email,
        invited_by_user_id,
        invited_at,
        accepted_at,
        visibility_scope,
        is_internal,
        can_view,
        can_comment,
        can_upload_documents
      )
      values (
        v_invite.target_transaction_id,
        v_user_id,
        coalesce(nullif(v_invite.target_transaction_role, ''), 'external_collaborator'),
        case
          when v_invite.target_transaction_role = 'attorney' then 'transfer_attorney'
          when v_invite.target_transaction_role = 'agent' then 'listing_agent'
          when v_invite.target_transaction_role = 'developer' then 'developer_contact'
          when v_invite.target_transaction_role = 'bond_originator' then 'bond_originator'
          when v_invite.target_transaction_role in ('buyer', 'client') then 'buyer'
          when v_invite.target_transaction_role = 'seller' then 'seller'
          else coalesce(nullif(v_invite.target_transaction_role, ''), 'external_collaborator')
        end,
        'active',
        v_email,
        v_invite.inviter_user_id,
        v_invite.created_at,
        v_now,
        case when v_invite.invite_type = 'client_invite' then 'client' else 'shared' end,
        false,
        true,
        true,
        true
      )
      returning id into v_participant_id;
    end if;

    perform public.bridge_record_invite_event(v_invite.id, 'participant_created_from_invite', v_user_id, jsonb_build_object('participant_id', v_participant_id));
  end if;

  update public.invites
  set status = 'accepted',
      invitee_user_id = v_user_id,
      accepted_by_user_id = v_user_id,
      accepted_at = v_now,
      updated_at = v_now
  where id = v_invite.id;

  perform public.bridge_record_invite_event(v_invite.id, 'invite_accepted', v_user_id);

  return jsonb_build_object(
    'success', true,
    'invite_id', v_invite.id,
    'invite_type', v_invite.invite_type,
    'workspace_id', v_invite.target_workspace_id,
    'membership_id', v_membership_id,
    'attorney_firm_id', v_attorney_firm_id,
    'attorney_member_id', v_attorney_member_id,
    'transaction_id', v_invite.target_transaction_id,
    'participant_id', v_participant_id,
    'redirect_to', case
      when v_invite.target_transaction_id is not null then '/transactions/' || v_invite.target_transaction_id::text
      when v_attorney_firm_id is not null then '/attorney/dashboard'
      when v_invite.target_workspace_id is not null then '/dashboard'
      else '/dashboard'
    end
  );
end;
$$;

insert into public.invites (
  invite_type,
  status,
  token,
  expires_at,
  inviter_user_id,
  target_workspace_id,
  target_workspace_role,
  target_branch_id,
  target_team_id,
  email,
  accepted_at,
  accepted_by_user_id,
  metadata,
  created_at,
  updated_at
)
select
  'workspace_invite',
  case when wi.status in ('pending', 'accepted', 'expired', 'revoked') then wi.status else 'pending' end,
  wi.token,
  wi.expires_at,
  wi.invited_by,
  wi.workspace_id,
  wi.organisation_role,
  wi.branch_id,
  wi.team_id,
  lower(wi.invited_email),
  wi.accepted_at,
  wi.accepted_by,
  jsonb_build_object(
    'legacy_source', 'workspace_invites',
    'legacy_invite_id', wi.id,
    'workspace_type', wi.workspace_type,
    'app_role', wi.app_role,
    'department_id', wi.department_id
  ),
  wi.created_at,
  wi.updated_at
from public.workspace_invites wi
where not exists (
  select 1 from public.invites i where i.token = wi.token
);

insert into public.invites (
  invite_type,
  status,
  token,
  expires_at,
  inviter_user_id,
  target_workspace_role,
  email,
  accepted_at,
  metadata,
  created_at,
  updated_at
)
select
  'workspace_invite',
  case when ai.status in ('pending', 'accepted', 'expired', 'cancelled') then replace(ai.status, 'cancelled', 'cancelled') else 'pending' end,
  ai.token,
  ai.expires_at,
  ai.invited_by,
  ai.role,
  lower(ai.email),
  ai.accepted_at,
  jsonb_build_object(
    'legacy_source', 'attorney_firm_invitations',
    'legacy_invite_id', ai.id,
    'attorney_firm_id', ai.firm_id,
    'department_id', ai.department_id
  ),
  ai.created_at,
  ai.updated_at
from public.attorney_firm_invitations ai
where not exists (
  select 1 from public.invites i where i.token = ai.token
);

grant execute on function public.bridge_create_invite(jsonb) to authenticated;
grant execute on function public.bridge_accept_invite(text) to authenticated;
grant execute on function public.bridge_record_invite_event(uuid, text, uuid, jsonb) to authenticated;

commit;
