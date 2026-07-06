begin;

update public.notification_automation_definitions
   set implementation_status = 'active',
       default_enabled = true,
       metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
         jsonb_build_object('phase', 'phase_2_acceptance_events'),
       updated_at = now()
 where automation_key in (
   'attorney_invite_accepted',
   'bond_originator_invite_accepted',
   'agent_invite_accepted'
 );

create or replace function public.bridge_notification_phase2_is_attorney_role(p_role text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_role, '')) = 'attorney'
      or lower(coalesce(p_role, '')) like '%_attorney'
      or lower(coalesce(p_role, '')) like '%attorney%'
      or lower(coalesce(p_role, '')) like '%conveyancer%';
$$;

create or replace function public.bridge_notification_phase2_role_label(p_role text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(p_role, ''))
    when 'transfer_attorney' then 'Transfer attorney'
    when 'bond_attorney' then 'Bond attorney'
    when 'cancellation_attorney' then 'Cancellation attorney'
    when 'bond_originator' then 'Bond originator'
    when 'agent' then 'Agent'
    when 'listing_agent' then 'Agent'
    else initcap(replace(coalesce(nullif(p_role, ''), 'partner'), '_', ' '))
  end;
$$;

create or replace function public.bridge_record_notification_event_phase2(
  p_automation_key text,
  p_organisation_id uuid,
  p_source text,
  p_actor_user_id uuid default null,
  p_recipient_user_id uuid default null,
  p_recipient_role text default null,
  p_recipient_email text default null,
  p_transaction_id uuid default null,
  p_branch_id uuid default null,
  p_lead_id uuid default null,
  p_listing_id uuid default null,
  p_subject text default null,
  p_message text default null,
  p_dedupe_key text default null,
  p_payload jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_definition public.notification_automation_definitions%rowtype;
  v_existing_id uuid;
  v_event_id uuid;
begin
  if p_organisation_id is null or nullif(trim(coalesce(p_automation_key, '')), '') is null then
    return null;
  end if;

  select *
    into v_definition
  from public.notification_automation_definitions
  where automation_key = p_automation_key
  limit 1;

  if v_definition.automation_key is null then
    return null;
  end if;

  if nullif(trim(coalesce(p_dedupe_key, '')), '') is not null then
    select id
      into v_existing_id
    from public.notification_events
    where organisation_id = p_organisation_id
      and dedupe_key = p_dedupe_key
    order by created_at desc
    limit 1;

    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  insert into public.notification_events (
    automation_key,
    organisation_id,
    branch_id,
    assigned_user_id,
    lead_id,
    listing_id,
    transaction_id,
    event_key,
    category,
    trigger_type,
    channel,
    status,
    recipient_email,
    recipient_role,
    subject,
    message_preview,
    source,
    dedupe_key,
    payload_json,
    metadata_json,
    sent_at
  )
  values (
    v_definition.automation_key,
    p_organisation_id,
    p_branch_id,
    p_recipient_user_id,
    p_lead_id,
    p_listing_id,
    p_transaction_id,
    v_definition.automation_key,
    v_definition.category,
    v_definition.trigger_type,
    'in_app',
    'sent',
    nullif(lower(trim(coalesce(p_recipient_email, ''))), ''),
    nullif(lower(trim(coalesce(p_recipient_role, v_definition.recipient_role, ''))), ''),
    nullif(trim(coalesce(p_subject, '')), ''),
    nullif(left(trim(coalesce(p_message, '')), 320), ''),
    coalesce(nullif(trim(p_source), ''), 'notification_automation_phase2'),
    nullif(trim(coalesce(p_dedupe_key, '')), ''),
    coalesce(p_payload, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'actorUserId', p_actor_user_id,
      'recipientUserId', p_recipient_user_id
    )),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'implementationStatus', v_definition.implementation_status,
      'defaultEnabled', v_definition.default_enabled,
      'phase', 'phase_2_acceptance_events'
    ),
    now()
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.bridge_insert_invite_accepted_transaction_notification_phase2(
  p_transaction_id uuid,
  p_recipient_user_id uuid,
  p_recipient_role text,
  p_title text,
  p_message text,
  p_dedupe_key text,
  p_event_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_notification_id uuid;
  v_role text := lower(coalesce(nullif(trim(p_recipient_role), ''), 'agent'));
begin
  if p_recipient_user_id is null or nullif(trim(coalesce(p_dedupe_key, '')), '') is null then
    return null;
  end if;

  if to_regclass('public.transaction_notifications') is null then
    return null;
  end if;

  if not exists (select 1 from public.profiles where id = p_recipient_user_id) then
    return null;
  end if;

  if v_role not in ('developer', 'agent', 'attorney', 'bond_originator', 'client', 'buyer', 'seller', 'internal_admin') then
    v_role := 'agent';
  end if;

  select id
    into v_existing_id
  from public.transaction_notifications
  where user_id = p_recipient_user_id
    and dedupe_key = p_dedupe_key
    and is_read = false
  order by created_at desc
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.transaction_notifications (
    transaction_id,
    user_id,
    role_type,
    notification_type,
    title,
    message,
    is_read,
    read_at,
    dedupe_key,
    event_type,
    event_data
  )
  values (
    p_transaction_id,
    p_recipient_user_id,
    v_role,
    'participant_assigned',
    coalesce(nullif(trim(p_title), ''), 'Invite accepted'),
    coalesce(nullif(trim(p_message), ''), 'An invite has been accepted.'),
    false,
    null,
    p_dedupe_key,
    'ParticipantAssigned',
    coalesce(p_event_data, '{}'::jsonb)
  )
  returning id into v_notification_id;

  return v_notification_id;
exception
  when undefined_table or undefined_column or check_violation or foreign_key_violation then
    return null;
end;
$$;

create or replace function public.bridge_notification_phase2_first_workspace_admin(
  p_organisation_id uuid
)
returns uuid
language sql
stable
as $$
  select ou.user_id
  from public.organisation_users ou
  where ou.organisation_id = p_organisation_id
    and ou.user_id is not null
    and lower(coalesce(ou.status, 'active')) in ('active', 'accepted')
    and coalesce(ou.workspace_role, ou.organisation_role, ou.role) in (
      'owner',
      'principal',
      'director',
      'partner',
      'admin',
      'admin_staff',
      'branch_manager',
      'manager'
    )
  order by ou.accepted_at desc nulls last, ou.created_at asc
  limit 1;
$$;

create or replace function public.bridge_record_transaction_partner_invite_accepted_notification_phase2(
  p_invitation_id uuid,
  p_actor_user_id uuid default null,
  p_source text default 'transaction_partner_invitations'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.transaction_partner_invitations%rowtype;
  v_organisation_id uuid;
  v_transaction_reference text := '';
  v_property_label text := '';
  v_recipient_user_id uuid;
  v_recipient_email text := '';
  v_automation_key text := '';
  v_role_label text := '';
  v_actor_user_id uuid;
  v_actor_label text := '';
  v_title text := '';
  v_message text := '';
  v_dedupe_key text := '';
  v_event_id uuid;
  v_notification_id uuid;
begin
  select *
    into v_invite
  from public.transaction_partner_invitations
  where id = p_invitation_id
  limit 1;

  if v_invite.id is null or v_invite.status <> 'accepted' then
    return null;
  end if;

  select
    tx.organisation_id,
    coalesce(nullif(tx.transaction_reference, ''), nullif(tx.matter_number, ''), tx.id::text),
    coalesce(
      nullif(concat_ws(', ', nullif(tx.property_address_line_1, ''), nullif(tx.suburb, ''), nullif(tx.city, '')), ''),
      nullif(tx.property_description, ''),
      'the transaction'
    )
    into v_organisation_id, v_transaction_reference, v_property_label
  from public.transactions tx
  where tx.id = v_invite.transaction_id
  limit 1;

  if v_organisation_id is null then
    return null;
  end if;

  if lower(coalesce(v_invite.role_type, '')) = 'bond_originator' then
    v_automation_key := 'bond_originator_invite_accepted';
  elsif public.bridge_notification_phase2_is_attorney_role(v_invite.role_type) then
    v_automation_key := 'attorney_invite_accepted';
  else
    return null;
  end if;

  v_actor_user_id := coalesce(p_actor_user_id, v_invite.accepted_user_id);
  v_recipient_user_id := v_invite.invited_by_user_id;

  if v_recipient_user_id is null then
    v_recipient_user_id := public.bridge_notification_phase2_first_workspace_admin(v_organisation_id);
  end if;

  if v_recipient_user_id is not null then
    select lower(coalesce(email, ''))
      into v_recipient_email
    from public.profiles
    where id = v_recipient_user_id
    limit 1;
  end if;

  if v_actor_user_id is not null then
    select coalesce(nullif(full_name, ''), nullif(email, ''), v_invite.contact_name, v_invite.company_name, v_invite.email, 'The invitee')
      into v_actor_label
    from public.profiles
    where id = v_actor_user_id
    limit 1;
  end if;

  v_actor_label := coalesce(nullif(v_actor_label, ''), v_invite.contact_name, v_invite.company_name, v_invite.email, 'The invitee');
  v_role_label := public.bridge_notification_phase2_role_label(v_invite.role_type);
  v_title := v_role_label || ' invite accepted';
  v_message := v_actor_label || ' accepted the ' || lower(v_role_label) || ' invite for ' || v_transaction_reference || '.';
  v_dedupe_key := v_automation_key || ':transaction_partner_invitation:' || v_invite.id::text || ':' || coalesce(v_recipient_user_id::text, 'unassigned');

  v_event_id := public.bridge_record_notification_event_phase2(
    v_automation_key,
    v_organisation_id,
    coalesce(nullif(p_source, ''), 'transaction_partner_invitations'),
    v_actor_user_id,
    v_recipient_user_id,
    'agent',
    v_recipient_email,
    v_invite.transaction_id,
    null,
    null,
    null,
    v_title,
    v_message,
    v_dedupe_key,
    jsonb_build_object(
      'invitationId', v_invite.id,
      'transactionId', v_invite.transaction_id,
      'roleType', v_invite.role_type,
      'roleLabel', v_role_label,
      'companyName', v_invite.company_name,
      'contactName', v_invite.contact_name,
      'acceptedUserId', v_actor_user_id,
      'acceptedAt', coalesce(v_invite.accepted_at, now()),
      'transactionReference', v_transaction_reference,
      'propertyLabel', v_property_label
    ),
    jsonb_build_object('notificationSurface', 'transaction_notifications')
  );

  if v_recipient_user_id is not null then
    v_notification_id := public.bridge_insert_invite_accepted_transaction_notification_phase2(
      v_invite.transaction_id,
      v_recipient_user_id,
      'agent',
      v_title,
      v_message,
      v_dedupe_key,
      jsonb_build_object(
        'source', coalesce(nullif(p_source, ''), 'transaction_partner_invitations'),
        'automationKey', v_automation_key,
        'notificationEventId', v_event_id,
        'invitationId', v_invite.id,
        'roleType', v_invite.role_type,
        'roleLabel', v_role_label,
        'acceptedUserId', v_actor_user_id,
        'acceptedAt', coalesce(v_invite.accepted_at, now()),
        'transactionReference', v_transaction_reference,
        'propertyLabel', v_property_label,
        'path', '/transactions/' || v_invite.transaction_id::text
      )
    );

    if v_notification_id is not null and v_event_id is not null then
      update public.notification_events
         set transaction_notification_id = v_notification_id
       where id = v_event_id;
    end if;
  end if;

  return v_event_id;
end;
$$;

create or replace function public.bridge_record_canonical_transaction_invite_accepted_notification_phase2(
  p_invite_id uuid,
  p_actor_user_id uuid default null,
  p_source text default 'canonical_invites'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_partner_invitation_id uuid;
  v_organisation_id uuid;
  v_transaction_reference text := '';
  v_property_label text := '';
  v_recipient_user_id uuid;
  v_recipient_email text := '';
  v_automation_key text := '';
  v_role_label text := '';
  v_actor_user_id uuid;
  v_actor_label text := '';
  v_title text := '';
  v_message text := '';
  v_dedupe_key text := '';
  v_event_id uuid;
  v_notification_id uuid;
begin
  select *
    into v_invite
  from public.invites
  where id = p_invite_id
  limit 1;

  if v_invite.id is null or v_invite.status <> 'accepted' or v_invite.target_transaction_id is null then
    return null;
  end if;

  begin
    v_partner_invitation_id := nullif(v_invite.metadata ->> 'transaction_partner_invitation_id', '')::uuid;
  exception
    when invalid_text_representation then
      v_partner_invitation_id := null;
  end;

  if v_partner_invitation_id is not null then
    return public.bridge_record_transaction_partner_invite_accepted_notification_phase2(
      v_partner_invitation_id,
      coalesce(p_actor_user_id, v_invite.accepted_by_user_id, v_invite.invitee_user_id),
      p_source
    );
  end if;

  if lower(coalesce(v_invite.target_transaction_role, '')) = 'bond_originator' then
    v_automation_key := 'bond_originator_invite_accepted';
  elsif public.bridge_notification_phase2_is_attorney_role(v_invite.target_transaction_role) then
    v_automation_key := 'attorney_invite_accepted';
  else
    return null;
  end if;

  select
    tx.organisation_id,
    coalesce(nullif(tx.transaction_reference, ''), nullif(tx.matter_number, ''), tx.id::text),
    coalesce(
      nullif(concat_ws(', ', nullif(tx.property_address_line_1, ''), nullif(tx.suburb, ''), nullif(tx.city, '')), ''),
      nullif(tx.property_description, ''),
      'the transaction'
    )
    into v_organisation_id, v_transaction_reference, v_property_label
  from public.transactions tx
  where tx.id = v_invite.target_transaction_id
  limit 1;

  if v_organisation_id is null then
    return null;
  end if;

  v_actor_user_id := coalesce(p_actor_user_id, v_invite.accepted_by_user_id, v_invite.invitee_user_id);
  v_recipient_user_id := coalesce(v_invite.inviter_user_id, public.bridge_notification_phase2_first_workspace_admin(v_organisation_id));

  if v_recipient_user_id is not null then
    select lower(coalesce(email, ''))
      into v_recipient_email
    from public.profiles
    where id = v_recipient_user_id
    limit 1;
  end if;

  if v_actor_user_id is not null then
    select coalesce(nullif(full_name, ''), nullif(email, ''), v_invite.email, 'The invitee')
      into v_actor_label
    from public.profiles
    where id = v_actor_user_id
    limit 1;
  end if;

  v_actor_label := coalesce(nullif(v_actor_label, ''), v_invite.email, 'The invitee');
  v_role_label := public.bridge_notification_phase2_role_label(v_invite.target_transaction_role);
  v_title := v_role_label || ' invite accepted';
  v_message := v_actor_label || ' accepted the ' || lower(v_role_label) || ' invite for ' || v_transaction_reference || '.';
  v_dedupe_key := v_automation_key || ':canonical_invite:' || v_invite.id::text || ':' || coalesce(v_recipient_user_id::text, 'unassigned');

  v_event_id := public.bridge_record_notification_event_phase2(
    v_automation_key,
    v_organisation_id,
    coalesce(nullif(p_source, ''), 'canonical_invites'),
    v_actor_user_id,
    v_recipient_user_id,
    'agent',
    v_recipient_email,
    v_invite.target_transaction_id,
    v_invite.target_branch_id,
    null,
    null,
    v_title,
    v_message,
    v_dedupe_key,
    jsonb_build_object(
      'inviteId', v_invite.id,
      'transactionId', v_invite.target_transaction_id,
      'roleType', v_invite.target_transaction_role,
      'roleLabel', v_role_label,
      'acceptedUserId', v_actor_user_id,
      'acceptedAt', coalesce(v_invite.accepted_at, now()),
      'transactionReference', v_transaction_reference,
      'propertyLabel', v_property_label
    ),
    jsonb_build_object('notificationSurface', 'transaction_notifications')
  );

  if v_recipient_user_id is not null then
    v_notification_id := public.bridge_insert_invite_accepted_transaction_notification_phase2(
      v_invite.target_transaction_id,
      v_recipient_user_id,
      'agent',
      v_title,
      v_message,
      v_dedupe_key,
      jsonb_build_object(
        'source', coalesce(nullif(p_source, ''), 'canonical_invites'),
        'automationKey', v_automation_key,
        'notificationEventId', v_event_id,
        'inviteId', v_invite.id,
        'roleType', v_invite.target_transaction_role,
        'roleLabel', v_role_label,
        'acceptedUserId', v_actor_user_id,
        'acceptedAt', coalesce(v_invite.accepted_at, now()),
        'transactionReference', v_transaction_reference,
        'propertyLabel', v_property_label,
        'path', '/transactions/' || v_invite.target_transaction_id::text
      )
    );

    if v_notification_id is not null and v_event_id is not null then
      update public.notification_events
         set transaction_notification_id = v_notification_id
       where id = v_event_id;
    end if;
  end if;

  return v_event_id;
end;
$$;

create or replace function public.bridge_record_workspace_invite_accepted_notification_phase2(
  p_invite_id uuid,
  p_actor_user_id uuid default null,
  p_source text default 'workspace_invites'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_organisation_name text := 'workspace';
  v_role_label text := '';
  v_actor_user_id uuid;
  v_actor_label text := '';
  v_recipient_user_id uuid;
  v_recipient_email text := '';
  v_title text := 'Agent invite accepted';
  v_message text := '';
  v_dedupe_key text := '';
  v_event_id uuid;
  v_notification_id uuid;
begin
  select *
    into v_invite
  from public.invites
  where id = p_invite_id
  limit 1;

  if v_invite.id is null
    or v_invite.status <> 'accepted'
    or v_invite.target_workspace_id is null
    or v_invite.invite_type not in ('workspace_invite', 'branch_invite', 'team_invite') then
    return null;
  end if;

  v_actor_user_id := coalesce(p_actor_user_id, v_invite.accepted_by_user_id, v_invite.invitee_user_id);
  v_recipient_user_id := coalesce(
    v_invite.inviter_user_id,
    public.bridge_notification_phase2_first_workspace_admin(v_invite.target_workspace_id)
  );
  v_role_label := public.bridge_notification_phase2_role_label(
    coalesce(
      nullif(v_invite.target_workspace_role, ''),
      nullif(v_invite.metadata ->> 'workspaceRole', ''),
      nullif(v_invite.metadata ->> 'workspace_role', ''),
      nullif(v_invite.metadata ->> 'role', ''),
      'agent'
    )
  );

  select coalesce(nullif(display_name, ''), nullif(name, ''), 'workspace')
    into v_organisation_name
  from public.organisations
  where id = v_invite.target_workspace_id
  limit 1;

  if v_recipient_user_id is not null then
    select lower(coalesce(email, ''))
      into v_recipient_email
    from public.profiles
    where id = v_recipient_user_id
    limit 1;
  end if;

  if v_actor_user_id is not null then
    select coalesce(nullif(full_name, ''), nullif(email, ''), v_invite.email, 'The invitee')
      into v_actor_label
    from public.profiles
    where id = v_actor_user_id
    limit 1;
  end if;

  v_actor_label := coalesce(nullif(v_actor_label, ''), v_invite.email, 'The invitee');
  v_title := case
    when lower(v_role_label) like '%agent%' then 'Agent invite accepted'
    else 'Workspace invite accepted'
  end;
  v_message := v_actor_label || ' accepted the ' || lower(v_role_label) || ' invite to ' || v_organisation_name || '.';
  v_dedupe_key := 'agent_invite_accepted:invite:' || v_invite.id::text || ':' || coalesce(v_recipient_user_id::text, 'unassigned');

  v_event_id := public.bridge_record_notification_event_phase2(
    'agent_invite_accepted',
    v_invite.target_workspace_id,
    coalesce(nullif(p_source, ''), 'workspace_invites'),
    v_actor_user_id,
    v_recipient_user_id,
    'admin',
    v_recipient_email,
    null,
    v_invite.target_branch_id,
    null,
    null,
    v_title,
    v_message,
    v_dedupe_key,
    jsonb_build_object(
      'inviteId', v_invite.id,
      'inviteType', v_invite.invite_type,
      'workspaceId', v_invite.target_workspace_id,
      'branchId', v_invite.target_branch_id,
      'workspaceRole', v_invite.target_workspace_role,
      'roleLabel', v_role_label,
      'acceptedUserId', v_actor_user_id,
      'acceptedAt', coalesce(v_invite.accepted_at, now())
    ),
    jsonb_build_object('notificationSurface', 'transaction_notifications')
  );

  if v_recipient_user_id is not null then
    v_notification_id := public.bridge_insert_invite_accepted_transaction_notification_phase2(
      null,
      v_recipient_user_id,
      'agent',
      v_title,
      v_message,
      v_dedupe_key,
      jsonb_build_object(
        'source', coalesce(nullif(p_source, ''), 'workspace_invites'),
        'automationKey', 'agent_invite_accepted',
        'notificationEventId', v_event_id,
        'inviteId', v_invite.id,
        'inviteType', v_invite.invite_type,
        'workspaceId', v_invite.target_workspace_id,
        'branchId', v_invite.target_branch_id,
        'workspaceRole', v_invite.target_workspace_role,
        'roleLabel', v_role_label,
        'acceptedUserId', v_actor_user_id,
        'acceptedAt', coalesce(v_invite.accepted_at, now()),
        'path', '/settings/team'
      )
    );

    if v_notification_id is not null and v_event_id is not null then
      update public.notification_events
         set transaction_notification_id = v_notification_id
       where id = v_event_id;
    end if;
  end if;

  return v_event_id;
end;
$$;

create or replace function public.bridge_handle_transaction_partner_invite_accepted_notification_phase2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'accepted' then
    return new;
  end if;

  if tg_op = 'INSERT'
    or (
      tg_op = 'UPDATE'
      and (
        old.status is distinct from 'accepted'
        or old.accepted_user_id is distinct from new.accepted_user_id
        or old.accepted_at is distinct from new.accepted_at
      )
    ) then
    perform public.bridge_record_transaction_partner_invite_accepted_notification_phase2(
      new.id,
      new.accepted_user_id,
      'transaction_partner_invitations'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transaction_partner_invite_accepted_notification_phase2
  on public.transaction_partner_invitations;
create trigger trg_transaction_partner_invite_accepted_notification_phase2
after insert or update of status, accepted_user_id, accepted_at
on public.transaction_partner_invitations
for each row
execute function public.bridge_handle_transaction_partner_invite_accepted_notification_phase2();

create or replace function public.bridge_handle_invite_accepted_notification_phase2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'accepted' then
    return new;
  end if;

  if tg_op = 'INSERT'
    or (
      tg_op = 'UPDATE'
      and (
        old.status is distinct from 'accepted'
        or old.accepted_by_user_id is distinct from new.accepted_by_user_id
        or old.invitee_user_id is distinct from new.invitee_user_id
        or old.accepted_at is distinct from new.accepted_at
      )
    ) then
    if new.invite_type in ('workspace_invite', 'branch_invite', 'team_invite') then
      perform public.bridge_record_workspace_invite_accepted_notification_phase2(
        new.id,
        coalesce(new.accepted_by_user_id, new.invitee_user_id),
        'canonical_invites'
      );
    elsif new.invite_type in ('transaction_invite', 'workspace_and_transaction_invite', 'external_collaborator_invite') then
      perform public.bridge_record_canonical_transaction_invite_accepted_notification_phase2(
        new.id,
        coalesce(new.accepted_by_user_id, new.invitee_user_id),
        'canonical_invites'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invite_accepted_notification_phase2
  on public.invites;
create trigger trg_invite_accepted_notification_phase2
after insert or update of status, accepted_by_user_id, invitee_user_id, accepted_at
on public.invites
for each row
execute function public.bridge_handle_invite_accepted_notification_phase2();

grant execute on function public.bridge_record_transaction_partner_invite_accepted_notification_phase2(uuid, uuid, text) to authenticated;
grant execute on function public.bridge_record_workspace_invite_accepted_notification_phase2(uuid, uuid, text) to authenticated;
grant execute on function public.bridge_record_canonical_transaction_invite_accepted_notification_phase2(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
