begin;

-- Reuse channel identity: one mailbox, one provider connection. Existing channels
-- remain workspace-shared; personal/team access is opt-in, never inferred.
alter table public.revo_inbox_channels
  add column access_scope text not null default 'workspace'
    check (access_scope in ('workspace', 'private', 'selected')),
  add column owner_user_id uuid references public.profiles(id) on delete restrict,
  add constraint shared_inbox_mailbox_owner_required
    check (access_scope = 'workspace' or (channel = 'email' and owner_user_id is not null)),
  add constraint shared_inbox_default_is_workspace_shared
    check (not is_default or access_scope = 'workspace');
update public.revo_inbox_channels set owner_user_id = created_by;
create index shared_inbox_channels_owner_idx on public.revo_inbox_channels(owner_user_id)
  where owner_user_id is not null;

create table public.shared_inbox_mailbox_members (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  channel_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_role text not null check (access_role in ('viewer', 'responder', 'manager')),
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id),
  foreign key (channel_id, organisation_id)
    references public.revo_inbox_channels(id, organisation_id) on delete cascade
);
create index shared_inbox_mailbox_members_user_idx
  on public.shared_inbox_mailbox_members(user_id, organisation_id, channel_id);
alter table public.shared_inbox_mailbox_members enable row level security;
revoke all on public.shared_inbox_mailbox_members from public, anon, authenticated;
grant select, insert, update, delete on public.shared_inbox_mailbox_members to authenticated;
grant all on public.shared_inbox_mailbox_members to service_role;

-- This core helper is NOT client-callable. Both RLS and verified server commands
-- use it; a caller cannot supply another user to an exposed browser RPC.
create function private.shared_inbox_permission_for_user(
  p_org uuid, p_channel uuid, p_user uuid, p_permission text
) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  mailbox public.revo_inbox_channels%rowtype;
  member_role text;
  is_admin boolean := false;
begin
  if p_user is null or p_permission not in ('read', 'work', 'send', 'manage') then return false; end if;
  if p_user = auth.uid() then
    -- Preserve the platform's accepted/email-linked membership semantics for
    -- existing browser users, rather than narrowing agency-wide Inbox access.
    if not public.bridge_is_active_member(p_org) then return false; end if;
  elsif not exists (select 1 from public.organisation_users u
    where u.organisation_id = p_org and u.user_id = p_user
      and lower(trim(coalesce(to_jsonb(u)->>'membership_status', to_jsonb(u)->>'status', ''))) in ('active', 'accepted')) then
    return false;
  end if;
  select * into mailbox from public.revo_inbox_channels where id = p_channel and organisation_id = p_org;
  if not found then return false; end if;
  if mailbox.owner_user_id = p_user then return true; end if;
  if mailbox.access_scope = 'private' then return false; end if;
  select access_role into member_role from public.shared_inbox_mailbox_members
    where channel_id = p_channel and organisation_id = p_org and user_id = p_user;
  if mailbox.access_scope = 'workspace' then
    if p_permission = 'read' then return true; end if;
    if p_permission = 'work' then return member_role is distinct from 'viewer'; end if;
    if p_permission = 'manage' then
      if p_user = auth.uid() then
        is_admin := public.bridge_is_org_admin(p_org);
      else
        -- Server-only connector path preserves its existing administrator roles.
        select exists (select 1 from public.organisation_users u where u.organisation_id = p_org
          and u.user_id = p_user and lower(trim(coalesce(to_jsonb(u)->>'membership_status', to_jsonb(u)->>'status', ''))) in ('active', 'accepted')
          and lower(trim(coalesce(to_jsonb(u)->>'role', ''))) in ('principal','owner','director','admin','super_admin','agency_admin')) into is_admin;
      end if;
      if is_admin then return true; end if;
    end if;
  end if;
  return coalesce(case p_permission
    when 'read' then member_role in ('viewer','responder','manager')
    when 'work' then member_role in ('responder','manager')
    when 'send' then member_role in ('responder','manager')
    when 'manage' then member_role = 'manager' end, false);
end;
$$;
revoke all on function private.shared_inbox_permission_for_user(uuid,uuid,uuid,text) from public, anon, authenticated;

create function private.shared_inbox_can_access(p_org uuid, p_channel uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.bridge_is_active_member(p_org)
    and private.shared_inbox_permission_for_user(p_org, p_channel, auth.uid(), p_permission);
$$;
create function private.shared_inbox_can_access_conversation(p_org uuid, p_conversation uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.revo_inbox_conversations c
    where c.id = p_conversation and c.organisation_id = p_org
      and private.shared_inbox_can_access(p_org, c.channel_id, p_permission));
$$;
create function private.shared_inbox_can_access_connection(p_org uuid, p_connection uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.revo_inbox_provider_connections c
    where c.id = p_connection and c.organisation_id = p_org
      and private.shared_inbox_can_access(p_org, c.channel_id, 'read'));
$$;
grant usage on schema private to authenticated;
revoke all on function private.shared_inbox_can_access(uuid,uuid,text) from public, anon;
revoke all on function private.shared_inbox_can_access_conversation(uuid,uuid,text) from public, anon;
revoke all on function private.shared_inbox_can_access_connection(uuid,uuid) from public, anon;
grant execute on function private.shared_inbox_can_access(uuid,uuid,text),
  private.shared_inbox_can_access_conversation(uuid,uuid,text),
  private.shared_inbox_can_access_connection(uuid,uuid) to authenticated;

create function public.shared_inbox_mailbox_permissions(p_organisation_id uuid, p_channel_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'read', private.shared_inbox_can_access(p_organisation_id,p_channel_id,'read'),
    'work', private.shared_inbox_can_access(p_organisation_id,p_channel_id,'work'),
    'send', private.shared_inbox_can_access(p_organisation_id,p_channel_id,'send'),
    'manage', private.shared_inbox_can_access(p_organisation_id,p_channel_id,'manage'));
$$;
revoke all on function public.shared_inbox_mailbox_permissions(uuid,uuid) from public, anon;
grant execute on function public.shared_inbox_mailbox_permissions(uuid,uuid) to authenticated;

create function public.shared_inbox_authorize_mailbox_user(
  p_organisation_id uuid, p_channel_id uuid, p_user_id uuid, p_permission text default 'manage'
) returns boolean language sql stable security definer set search_path = '' as $$
  select private.shared_inbox_permission_for_user(p_organisation_id,p_channel_id,p_user_id,p_permission);
$$;
revoke all on function public.shared_inbox_authorize_mailbox_user(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.shared_inbox_authorize_mailbox_user(uuid,uuid,uuid,text) to service_role;

-- Sharing/ownership changes are atomic. A manager may deliberately relinquish
-- access, so return only the mailbox metadata they could read before the change.
-- The privileged operation lives in private and authorises the original caller.
create function private.shared_inbox_update_mailbox_access(
  p_org uuid, p_channel uuid, p_scope text, p_owner uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare mailbox public.revo_inbox_channels%rowtype;
begin
  select * into mailbox from public.revo_inbox_channels where id = p_channel and organisation_id = p_org for update;
  if not found or not private.shared_inbox_can_access(p_org,p_channel,'manage') then
    raise exception 'Mailbox management access is required';
  end if;
  if mailbox.channel <> 'email' or p_scope is null or p_scope not in ('workspace','private','selected') then
    raise exception 'Choose a valid email mailbox access scope';
  end if;
  update public.revo_inbox_channels set access_scope = p_scope,
    owner_user_id = coalesce(p_owner,mailbox.owner_user_id,auth.uid()),
    is_default = case when p_scope = 'workspace' then is_default else false end
    where id = p_channel and organisation_id = p_org returning * into mailbox;
  return to_jsonb(mailbox);
end;
$$;
revoke all on function private.shared_inbox_update_mailbox_access(uuid,uuid,text,uuid) from public,anon;
grant execute on function private.shared_inbox_update_mailbox_access(uuid,uuid,text,uuid) to authenticated;
create function public.shared_inbox_update_mailbox_access(
  p_organisation_id uuid, p_channel_id uuid, p_access_scope text, p_owner_user_id uuid default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.shared_inbox_update_mailbox_access(p_organisation_id,p_channel_id,p_access_scope,p_owner_user_id);
$$;
revoke all on function public.shared_inbox_update_mailbox_access(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.shared_inbox_update_mailbox_access(uuid,uuid,text,uuid) to authenticated;

-- SELECT and FOR ALL policies are permissive/ORed. Restrictive boundaries below
-- also constrain existing administrative and workflow policies.
drop policy revo_inbox_channels_admin_write on public.revo_inbox_channels;
create policy shared_inbox_channel_create on public.revo_inbox_channels for insert to authenticated
with check (public.bridge_is_active_member(organisation_id) and (
  public.bridge_is_org_admin(organisation_id)
  or (channel = 'email' and access_scope = 'private' and owner_user_id = auth.uid())
));
create policy shared_inbox_channel_update on public.revo_inbox_channels for update to authenticated
using (private.shared_inbox_can_access(organisation_id,id,'manage'))
with check (public.bridge_is_active_member(organisation_id));
-- Use the row itself for owner/workspace reads: INSERT ... RETURNING must not
-- depend on a STABLE helper re-reading a row absent from the command snapshot.
create policy shared_inbox_channel_boundary on public.revo_inbox_channels as restrictive for select to authenticated
using (public.bridge_is_active_member(organisation_id) and (access_scope = 'workspace'
  or owner_user_id = auth.uid() or private.shared_inbox_can_access(organisation_id,id,'read')));
alter policy revo_inbox_channels_member_read on public.revo_inbox_channels
using (public.bridge_is_active_member(organisation_id) and (access_scope = 'workspace'
  or owner_user_id = auth.uid() or private.shared_inbox_can_access(organisation_id,id,'read')));

create policy shared_inbox_members_read on public.shared_inbox_mailbox_members for select to authenticated
using (private.shared_inbox_can_access(organisation_id,channel_id,'read'));
create policy shared_inbox_members_write on public.shared_inbox_mailbox_members for all to authenticated
using (private.shared_inbox_can_access(organisation_id,channel_id,'manage'))
with check (private.shared_inbox_can_access(organisation_id,channel_id,'manage'));

create policy shared_inbox_conversation_boundary on public.revo_inbox_conversations as restrictive for all to authenticated
using (private.shared_inbox_can_access(organisation_id,channel_id,'read'))
with check (private.shared_inbox_can_access(organisation_id,channel_id,'work'));
create policy shared_inbox_conversation_work on public.revo_inbox_conversations as restrictive for update to authenticated
using (private.shared_inbox_can_access(organisation_id,channel_id,'work'))
with check (private.shared_inbox_can_access(organisation_id,channel_id,'work'));

create policy shared_inbox_messages_boundary on public.revo_inbox_messages as restrictive for all to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'read'))
with check (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));
create policy shared_inbox_messages_update_work on public.revo_inbox_messages as restrictive for update to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));
create policy shared_inbox_messages_delete_work on public.revo_inbox_messages as restrictive for delete to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));

create policy shared_inbox_activity_boundary on public.revo_inbox_activity as restrictive for all to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'read'))
with check (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));
create policy shared_inbox_activity_update_work on public.revo_inbox_activity as restrictive for update to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));
create policy shared_inbox_activity_delete_work on public.revo_inbox_activity as restrictive for delete to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));

create policy shared_inbox_associations_boundary on public.revo_inbox_associations as restrictive for all to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'read'))
with check (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));
create policy shared_inbox_associations_update_work on public.revo_inbox_associations as restrictive for update to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));
create policy shared_inbox_associations_delete_work on public.revo_inbox_associations as restrictive for delete to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));

create policy shared_inbox_workflow_requests_boundary on public.revo_inbox_workflow_requests as restrictive for all to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'read'))
with check (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));
create policy shared_inbox_workflow_requests_update_work on public.revo_inbox_workflow_requests as restrictive for update to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));
create policy shared_inbox_workflow_requests_delete_work on public.revo_inbox_workflow_requests as restrictive for delete to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));

create policy shared_inbox_escalations_boundary on public.revo_inbox_escalations as restrictive for all to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'read'))
with check (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));
create policy shared_inbox_escalations_update_work on public.revo_inbox_escalations as restrictive for update to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));
create policy shared_inbox_escalations_delete_work on public.revo_inbox_escalations as restrictive for delete to authenticated
using (private.shared_inbox_can_access_conversation(organisation_id,conversation_id,'work'));

create policy shared_inbox_connection_boundary on public.revo_inbox_provider_connections as restrictive for all to authenticated
using (private.shared_inbox_can_access(organisation_id,channel_id,'read'))
with check (false);
create policy shared_inbox_connection_events_boundary on public.revo_inbox_connection_events as restrictive for all to authenticated
using (private.shared_inbox_can_access_connection(organisation_id,connection_id)) with check (false);
create policy shared_inbox_sync_runs_boundary on public.revo_inbox_sync_runs as restrictive for all to authenticated
using (private.shared_inbox_can_access_connection(organisation_id,connection_id)) with check (false);

alter policy revo_inbox_messages_member_update_own_draft on public.revo_inbox_messages
using (public.bridge_is_active_member(organisation_id) and created_by = auth.uid()
  and direction = 'internal' and message_type = 'draft' and delivery_status = 'queued')
with check (public.bridge_is_active_member(organisation_id) and created_by = auth.uid()
  and direction = 'internal' and message_type = 'draft' and delivery_status = 'queued');

-- Private schema USAGE is needed for policy helpers, never for credential access.
revoke all on private.revo_inbox_connection_credentials, private.revo_inbox_ingestion_receipts
  from public,anon,authenticated;

-- Validate sharing recipients without exposing the organisation member table.
create function private.shared_inbox_validate_mailbox() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_user uuid;
begin
  if tg_table_name = 'shared_inbox_mailbox_members' then
    target_user := new.user_id;
    perform 1 from public.revo_inbox_channels where id = new.channel_id
      and organisation_id = new.organisation_id and channel = 'email' and access_scope <> 'private' for update;
    if not found then
      raise exception 'Only a shared email mailbox can have members';
    end if;
  else
    target_user := new.owner_user_id;
    if tg_op = 'UPDATE' and new.owner_user_id is not distinct from old.owner_user_id then return new; end if;
  end if;
  if target_user is not null and not exists (select 1 from public.organisation_users u
    where u.organisation_id = new.organisation_id and u.user_id = target_user
      and lower(trim(coalesce(to_jsonb(u)->>'membership_status',to_jsonb(u)->>'status',''))) in ('active','accepted')) then
    raise exception 'Mailbox owners and members must be active in the same organisation';
  end if;
  return new;
end;
$$;
revoke all on function private.shared_inbox_validate_mailbox() from public,anon,authenticated;
create trigger shared_inbox_validate_mailbox before insert or update on public.revo_inbox_channels
for each row execute function private.shared_inbox_validate_mailbox();
create trigger shared_inbox_validate_member before insert or update on public.shared_inbox_mailbox_members
for each row execute function private.shared_inbox_validate_mailbox();
create trigger shared_inbox_keep_organisation before update on public.shared_inbox_mailbox_members
for each row execute function public.shared_inbox_keep_organisation();

-- A visibility change clears grants so old recipients cannot silently regain
-- access if a mailbox is later shared again. Ownership transfer is explicit.
create function private.shared_inbox_clear_old_grants() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.access_scope is distinct from old.access_scope or new.owner_user_id is distinct from old.owner_user_id then
    delete from public.shared_inbox_mailbox_members where channel_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.shared_inbox_clear_old_grants() from public,anon,authenticated;
create trigger shared_inbox_clear_old_grants after update on public.revo_inbox_channels
for each row execute function private.shared_inbox_clear_old_grants();

create function private.shared_inbox_keep_mailbox_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.channel is distinct from old.channel
    or new.provider_key is distinct from old.provider_key or new.address is distinct from old.address then
    raise exception 'The mailbox identity cannot change; create a separate mailbox';
  end if;
  return new;
end;
$$;
revoke all on function private.shared_inbox_keep_mailbox_identity() from public,anon,authenticated;
create trigger shared_inbox_keep_mailbox_identity before update on public.revo_inbox_channels
for each row execute function private.shared_inbox_keep_mailbox_identity();

-- Child identity cannot be moved between mailboxes, even by someone who can
-- access both. The message channel_id is derived for legacy connector inserts.
alter table public.revo_inbox_conversations add constraint shared_inbox_conversation_mailbox_identity
  unique (id, channel_id, organisation_id);
alter table public.revo_inbox_messages add column channel_id uuid;
update public.revo_inbox_messages m set channel_id = c.channel_id
from public.revo_inbox_conversations c where c.id = m.conversation_id and c.organisation_id = m.organisation_id;
alter table public.revo_inbox_messages alter column channel_id set not null;
alter table public.revo_inbox_messages add constraint shared_inbox_message_mailbox_fk
  foreign key (conversation_id,channel_id,organisation_id)
  references public.revo_inbox_conversations(id,channel_id,organisation_id) on delete cascade;
create function private.shared_inbox_keep_parent() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.id is distinct from old.id
    or (to_jsonb(new)->>'channel_id') is distinct from (to_jsonb(old)->>'channel_id')
    or (to_jsonb(new)->>'conversation_id') is distinct from (to_jsonb(old)->>'conversation_id')
    or (to_jsonb(new)->>'connection_id') is distinct from (to_jsonb(old)->>'connection_id')) then
    raise exception 'Inbox records cannot move between mailboxes or conversations';
  end if;
  if tg_table_name = 'revo_inbox_messages' then
    if new.channel_id is not null and not exists (select 1 from public.revo_inbox_conversations
      where id = new.conversation_id and organisation_id = new.organisation_id and channel_id = new.channel_id) then
      raise exception 'The message mailbox must match its conversation';
    end if;
    select channel_id into new.channel_id from public.revo_inbox_conversations
      where id = new.conversation_id and organisation_id = new.organisation_id;
    if new.channel_id is null then raise exception 'Mailbox conversation not found'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.shared_inbox_keep_parent() from public,anon,authenticated;
create trigger shared_inbox_keep_parent before insert or update on public.revo_inbox_conversations
for each row execute function private.shared_inbox_keep_parent();
create trigger shared_inbox_keep_parent before insert or update on public.revo_inbox_messages
for each row execute function private.shared_inbox_keep_parent();
create trigger shared_inbox_keep_parent before insert or update on public.revo_inbox_provider_connections
for each row execute function private.shared_inbox_keep_parent();
create trigger shared_inbox_keep_parent before insert or update on public.revo_inbox_connection_events
for each row execute function private.shared_inbox_keep_parent();
create trigger shared_inbox_keep_parent before insert or update on public.revo_inbox_sync_runs
for each row execute function private.shared_inbox_keep_parent();
create trigger shared_inbox_keep_parent before insert or update on public.revo_inbox_activity
for each row execute function private.shared_inbox_keep_parent();
create trigger shared_inbox_keep_parent before insert or update on public.revo_inbox_associations
for each row execute function private.shared_inbox_keep_parent();
create trigger shared_inbox_keep_parent before insert or update on public.revo_inbox_workflow_requests
for each row execute function private.shared_inbox_keep_parent();
create trigger shared_inbox_keep_parent before insert or update on public.revo_inbox_escalations
for each row execute function private.shared_inbox_keep_parent();

-- Dedupe within a mailbox, not across every mailbox in the organisation.
drop index public.revo_inbox_messages_provider_message_key;
create unique index revo_inbox_messages_provider_message_key
  on public.revo_inbox_messages(organisation_id,channel_id,provider_key,provider_message_id)
  where provider_message_id is not null;

alter table public.revo_inbox_sync_runs add constraint shared_inbox_sync_run_connection_fk
  foreign key (connection_id,organisation_id) references public.revo_inbox_provider_connections(id,organisation_id) on delete cascade;
alter table public.revo_inbox_workflow_requests add constraint shared_inbox_workflow_conversation_fk
  foreign key (conversation_id,organisation_id) references public.revo_inbox_conversations(id,organisation_id) on delete cascade;
alter table public.revo_inbox_escalations add constraint shared_inbox_escalation_conversation_fk
  foreign key (conversation_id,organisation_id) references public.revo_inbox_conversations(id,organisation_id) on delete cascade;

-- Per-connection, per-folder cursors are opaque server state, never credentials
-- or browser-editable metadata. Scheduling leases remain on each connection.
create table private.shared_inbox_sync_state (
  organisation_id uuid not null,
  connection_id uuid not null,
  folder_key text not null check (length(trim(folder_key)) > 0),
  cursor_json jsonb not null default '{}'::jsonb check (jsonb_typeof(cursor_json) = 'object'),
  last_success_at timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now(),
  primary key (connection_id,folder_key),
  foreign key (connection_id,organisation_id) references public.revo_inbox_provider_connections(id,organisation_id) on delete cascade
);
alter table private.shared_inbox_sync_state enable row level security;
revoke all on private.shared_inbox_sync_state from public,anon,authenticated;
grant usage on schema private to service_role;
grant all on private.shared_inbox_sync_state to service_role;
create trigger shared_inbox_sync_state_timestamp before update on private.shared_inbox_sync_state
for each row execute function public.set_updated_at_timestamp();
create trigger shared_inbox_keep_organisation before update on private.shared_inbox_sync_state
for each row execute function public.shared_inbox_keep_organisation();

-- Reserve generic email connections for the IMAP/SMTP connector; no connector
-- is enabled and no credentials are created by this foundation migration.
alter table public.revo_inbox_provider_connections drop constraint revo_inbox_provider_connections_provider_key_check;
alter table public.revo_inbox_provider_connections add constraint revo_inbox_provider_connections_provider_key_check
  check (provider_key in ('microsoft_365','google_workspace','other_email'));

-- A private/selected mailbox cannot become the agency-wide default through the
-- legacy privileged RPC. Existing workspace defaults keep their old behaviour.
create or replace function public.revo_set_default_inbox_channel(p_channel_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.revo_inbox_channels%rowtype;
begin
  select * into target from public.revo_inbox_channels where id = p_channel_id;
  if not found or not public.bridge_is_active_member(target.organisation_id)
    or not public.bridge_is_org_admin(target.organisation_id) then
    raise exception 'Only an organisation administrator can change the default inbox channel';
  end if;
  if target.access_scope <> 'workspace' then raise exception 'The organisation default must be a workspace-shared mailbox'; end if;
  perform pg_advisory_xact_lock(hashtext(target.organisation_id::text || ':' || target.channel));
  update public.revo_inbox_channels set is_default = false
    where organisation_id = target.organisation_id and channel = target.channel and is_default;
  update public.revo_inbox_channels set is_default = true where id = target.id;
  return target.id;
end;
$$;
revoke all on function public.revo_set_default_inbox_channel(uuid) from public,anon;
grant execute on function public.revo_set_default_inbox_channel(uuid) to authenticated;

-- Preserve the service-only legacy enquiry ingester with the new conflict key.
create or replace function public.revo_ingest_external_enquiry(
  p_organisation_id uuid,
  p_source_channel text,
  p_external_reference text,
  p_contact_name text,
  p_contact_address text,
  p_subject text default null,
  p_message_body text default '',
  p_listing_id uuid default null,
  p_lead_id uuid default null,
  p_assigned_user_id uuid default null,
  p_received_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb
)
returns table (conversation_id uuid, created boolean, assigned_user_id uuid)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_source text := lower(btrim(coalesce(p_source_channel, '')));
  v_reference text := btrim(coalesce(p_external_reference, ''));
  v_address text := lower(btrim(coalesce(p_contact_address, '')));
  v_channel_id uuid;
  v_conversation_id uuid;
  v_existing_receipt uuid;
  v_assignee uuid := p_assigned_user_id;
begin
  if p_organisation_id <> '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid then
    raise exception 'revo_only';
  end if;
  if v_source not in ('website', 'property24', 'private_property') or v_reference = '' then
    raise exception 'invalid_external_enquiry';
  end if;
  if v_address = '' then
    v_address := concat('unidentified+', replace(v_reference, ' ', '-'), '@inbound.revo.local');
  end if;

  select receipt.conversation_id into v_existing_receipt
  from private.revo_inbox_ingestion_receipts receipt
  where organisation_id = p_organisation_id and source_channel = v_source and external_reference = v_reference;
  if v_existing_receipt is not null then
    return query select v_existing_receipt, false, null::uuid;
    return;
  end if;

  if v_assignee is not null and not exists (
    select 1 from public.organisation_users
    where organisation_id = p_organisation_id and user_id = v_assignee and status = 'active'
  ) then
    v_assignee := null;
  end if;

  insert into public.revo_inbox_channels (
    organisation_id, channel, provider_key, address, display_name, connection_status, metadata_json
  ) values (
    p_organisation_id, v_source, 'arch9_ingestion', concat('source:', v_source), initcap(replace(v_source, '_', ' ')), 'connected', '{"system":true}'::jsonb
  ) on conflict (organisation_id, channel, lower(address)) do update
    set updated_at = now()
  returning id into v_channel_id;

  insert into public.revo_inbox_conversations (
    organisation_id, channel_id, provider_key, provider_thread_id, contact_name, contact_address,
    subject, status, assigned_user_id, last_message_at, last_inbound_at, last_message_preview, metadata_json
  ) values (
    p_organisation_id, v_channel_id, 'arch9_ingestion', v_reference, nullif(btrim(p_contact_name), ''), v_address,
    nullif(btrim(p_subject), ''), 'waiting_on_us', v_assignee, p_received_at, p_received_at, left(coalesce(p_message_body, ''), 500),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('sourceChannel', v_source, 'externalReference', v_reference)
  ) on conflict (organisation_id, channel_id, provider_key, provider_thread_id)
    where provider_key is not null and provider_thread_id is not null do update
    set last_message_at = excluded.last_message_at,
        last_inbound_at = excluded.last_inbound_at,
        last_message_preview = excluded.last_message_preview,
        unread_count = public.revo_inbox_conversations.unread_count + 1,
        assigned_user_id = coalesce(public.revo_inbox_conversations.assigned_user_id, excluded.assigned_user_id)
  returning id, revo_inbox_conversations.assigned_user_id into v_conversation_id, v_assignee;

  insert into public.revo_inbox_messages (
    organisation_id, conversation_id, channel, direction, message_type, provider_key, provider_message_id,
    provider_thread_id, sender_address, recipient_addresses, subject, body_text, delivery_status, occurred_at, metadata_json
  ) values (
    p_organisation_id, v_conversation_id, v_source, 'inbound', 'message', 'arch9_ingestion', concat(v_source, ':', v_reference),
    v_reference, v_address, array[concat('source:', v_source)], nullif(btrim(p_subject), ''), coalesce(p_message_body, ''), 'received', p_received_at, coalesce(p_metadata, '{}'::jsonb)
  ) on conflict (organisation_id, channel_id, provider_key, provider_message_id) where provider_message_id is not null do nothing;

  if p_listing_id is not null then
    insert into public.revo_inbox_associations (organisation_id, conversation_id, entity_type, entity_id, is_primary)
    values (p_organisation_id, v_conversation_id, 'listing', p_listing_id, true)
    on conflict (conversation_id, entity_type, entity_id) do update set is_primary = true;
  end if;
  if p_lead_id is not null then
    insert into public.revo_inbox_associations (organisation_id, conversation_id, entity_type, entity_id, is_primary)
    values (p_organisation_id, v_conversation_id, 'lead', p_lead_id, true)
    on conflict (conversation_id, entity_type, entity_id) do update set is_primary = true;
  end if;

  insert into private.revo_inbox_ingestion_receipts (organisation_id, source_channel, external_reference, conversation_id, metadata_json)
  values (p_organisation_id, v_source, v_reference, v_conversation_id, coalesce(p_metadata, '{}'::jsonb));

  return query select v_conversation_id, true, v_assignee;
end;
$$;

revoke all on function public.revo_ingest_external_enquiry(uuid,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.revo_ingest_external_enquiry(uuid,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz,jsonb) to service_role;

comment on column public.revo_inbox_channels.access_scope is 'workspace preserves legacy agency sharing; private is owner-only; selected uses explicit mailbox members.';
comment on table public.shared_inbox_mailbox_members is 'Active same-organisation email mailbox access. A mailbox grant never grants agency membership.';
comment on table private.shared_inbox_sync_state is 'Server-only checkpoint per mailbox connection and folder. Provider tokens remain in Vault.';
commit;
