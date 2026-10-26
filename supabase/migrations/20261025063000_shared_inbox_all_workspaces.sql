begin;

-- Promote the existing Inbox storage to all organisations. Legacy table/RPC names
-- are retained for deployed connectors; no messages are copied between tenants.
-- Every existing operation keeps its member/admin/author restrictions.

alter policy revo_inbox_activity_member_read on public.revo_inbox_activity
using (
  public.bridge_is_active_member(organisation_id)
);

alter policy revo_inbox_associations_member_read on public.revo_inbox_associations
using (
  public.bridge_is_active_member(organisation_id)
);

alter policy revo_inbox_associations_member_write on public.revo_inbox_associations
using (
  public.bridge_is_active_member(organisation_id)
)
with check (
  public.bridge_is_active_member(organisation_id)
  and (created_by is null or created_by = (select auth.uid()))
);

alter policy revo_inbox_channels_admin_write on public.revo_inbox_channels
using (public.bridge_is_active_member(organisation_id) and 
  public.bridge_is_org_admin(organisation_id)
)
with check (public.bridge_is_active_member(organisation_id) and 
  public.bridge_is_org_admin(organisation_id)
);

alter policy revo_inbox_channels_member_read on public.revo_inbox_channels
using (
  public.bridge_is_active_member(organisation_id)
);

alter policy revo_inbox_connection_events_member_read on public.revo_inbox_connection_events
using (
  public.bridge_is_active_member(organisation_id)
);

alter policy revo_inbox_conversations_member_read on public.revo_inbox_conversations
using (
  public.bridge_is_active_member(organisation_id)
);

alter policy revo_inbox_conversations_member_update on public.revo_inbox_conversations
using (
  public.bridge_is_active_member(organisation_id)
)
with check (
  public.bridge_is_active_member(organisation_id)
);

alter policy revo_inbox_escalations_member_read on public.revo_inbox_escalations
using (public.bridge_is_active_member(organisation_id));

alter policy revo_inbox_escalations_member_update on public.revo_inbox_escalations
using (public.bridge_is_active_member(organisation_id))
with check (public.bridge_is_active_member(organisation_id));

alter policy revo_inbox_messages_member_insert_private_work on public.revo_inbox_messages
with check (
  public.bridge_is_active_member(organisation_id)
  and created_by = (select auth.uid())
  and direction = 'internal'
  and message_type in ('note', 'draft')
  and delivery_status = 'queued'
);

alter policy revo_inbox_messages_member_read on public.revo_inbox_messages
using (
  public.bridge_is_active_member(organisation_id)
);

alter policy revo_inbox_messages_member_update_own_draft on public.revo_inbox_messages
using (public.bridge_is_active_member(organisation_id) and 
  created_by = (select auth.uid())
  and message_type = 'draft'
  and delivery_status = 'queued'
)
with check (public.bridge_is_active_member(organisation_id) and 
  created_by = (select auth.uid())
  and message_type = 'draft'
  and delivery_status = 'queued'
);

alter policy revo_inbox_provider_connections_member_read on public.revo_inbox_provider_connections
using (
  public.bridge_is_active_member(organisation_id)
);

alter policy revo_inbox_routing_rules_admin_write on public.revo_inbox_routing_rules
using (public.bridge_is_active_member(organisation_id) and public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_active_member(organisation_id) and public.bridge_is_org_admin(organisation_id));

alter policy revo_inbox_routing_rules_member_read on public.revo_inbox_routing_rules
using (public.bridge_is_active_member(organisation_id));

alter policy revo_inbox_sla_policies_admin_write on public.revo_inbox_sla_policies
using (public.bridge_is_active_member(organisation_id) and public.bridge_is_org_admin(organisation_id))
with check (public.bridge_is_active_member(organisation_id) and public.bridge_is_org_admin(organisation_id));

alter policy revo_inbox_sla_policies_member_read on public.revo_inbox_sla_policies
using (public.bridge_is_active_member(organisation_id));

alter policy revo_inbox_sync_runs_member_read on public.revo_inbox_sync_runs
using (
  public.bridge_is_active_member(organisation_id)
);

alter policy revo_inbox_workflow_requests_member_insert on public.revo_inbox_workflow_requests
with check (
  public.bridge_is_active_member(organisation_id)
  and requested_by = (select auth.uid())
);

alter policy revo_inbox_workflow_requests_member_read on public.revo_inbox_workflow_requests
using (
  public.bridge_is_active_member(organisation_id)
);

alter policy revo_inbox_workflow_requests_member_update on public.revo_inbox_workflow_requests
using (
  public.bridge_is_active_member(organisation_id)
)
with check (
  public.bridge_is_active_member(organisation_id)
);

create or replace function public.revo_set_default_inbox_channel(p_channel_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_channel public.revo_inbox_channels%rowtype;
begin
  select * into target_channel
  from public.revo_inbox_channels
  where id = p_channel_id;

  if not found then
    raise exception 'Shared inbox channel not found';
  end if;

  if not public.bridge_is_active_member(target_channel.organisation_id)
    or not public.bridge_is_org_admin(target_channel.organisation_id) then
    raise exception 'Only an organisation administrator can change the default inbox channel';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_channel.organisation_id::text || ':' || target_channel.channel));

  update public.revo_inbox_channels
  set is_default = false
  where organisation_id = target_channel.organisation_id
    and channel = target_channel.channel
    and is_default;

  update public.revo_inbox_channels
  set is_default = true
  where id = target_channel.id;

  return target_channel.id;
end;
$$;

create or replace function public.revo_store_inbox_connection_credential(
  p_connection_id uuid,
  p_secret jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  existing_secret_id uuid;
  next_secret_id uuid;
  connection_org_id uuid;
begin
  select organisation_id into connection_org_id
  from public.revo_inbox_provider_connections
  where id = p_connection_id;

  if connection_org_id is null then
    raise exception 'Shared inbox connection not found';
  end if;

  if p_secret is null or p_secret = '{}'::jsonb then
    raise exception 'A non-empty provider credential is required';
  end if;

  select vault_secret_id into existing_secret_id
  from private.revo_inbox_connection_credentials
  where connection_id = p_connection_id;

  if existing_secret_id is null then
    next_secret_id := vault.create_secret(
      p_secret::text,
      'revo_inbox_connection_' || p_connection_id::text,
      'Revo provider credential; managed only by server-side connector functions.'
    );
    insert into private.revo_inbox_connection_credentials (connection_id, vault_secret_id)
    values (p_connection_id, next_secret_id);
  else
    perform vault.update_secret(
      existing_secret_id,
      p_secret::text,
      'revo_inbox_connection_' || p_connection_id::text,
      'Revo provider credential; managed only by server-side connector functions.'
    );
    update private.revo_inbox_connection_credentials
    set updated_at = now()
    where connection_id = p_connection_id;
  end if;
end;
$$;

create or replace function public.revo_read_inbox_connection_credential(
  p_connection_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  credential jsonb;
begin
  if not exists (
    select 1 from public.revo_inbox_provider_connections
    where id = p_connection_id
  ) then
    raise exception 'Shared inbox connection not found';
  end if;

  select decrypted_secret::jsonb into credential
  from private.revo_inbox_connection_credentials credential_map
  join vault.decrypted_secrets secret on secret.id = credential_map.vault_secret_id
  where credential_map.connection_id = p_connection_id;

  if credential is null then
    raise exception 'Shared inbox credential not found';
  end if;
  return credential;
end;
$$;

create or replace function public.revo_clear_inbox_connection_credential(
  p_connection_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  secret_id uuid;
begin
  if not exists (
    select 1 from public.revo_inbox_provider_connections
    where id = p_connection_id
  ) then
    raise exception 'Shared inbox connection not found';
  end if;

  select vault_secret_id into secret_id
  from private.revo_inbox_connection_credentials
  where connection_id = p_connection_id;

  if secret_id is not null then
    perform vault.update_secret(
      secret_id,
      '{"revoked":true}'::text,
      'revo_inbox_connection_' || p_connection_id::text,
      'Revo provider credential cleared after disconnection.'
    );
    delete from private.revo_inbox_connection_credentials
    where connection_id = p_connection_id;
  end if;
end;
$$;

-- Credential functions remain strictly server-only.
revoke all on function public.revo_store_inbox_connection_credential(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.revo_read_inbox_connection_credential(uuid) from public, anon, authenticated;
revoke all on function public.revo_clear_inbox_connection_credential(uuid) from public, anon, authenticated;
grant execute on function public.revo_store_inbox_connection_credential(uuid, jsonb) to service_role;
grant execute on function public.revo_read_inbox_connection_credential(uuid) to service_role;
grant execute on function public.revo_clear_inbox_connection_credential(uuid) to service_role;
revoke all on table public.revo_inbox_oauth_states from anon, authenticated;

-- Even members of multiple organisations cannot move existing inbox records
-- between workspaces. Existing composite FKs enforce channel/thread isolation.
create function public.shared_inbox_keep_organisation()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.organisation_id is distinct from old.organisation_id then
    raise exception 'Inbox records cannot move between organisations';
  end if;
  return new;
end;
$$;
revoke all on function public.shared_inbox_keep_organisation() from public, anon, authenticated;

create trigger shared_inbox_keep_organisation before update on public.revo_inbox_activity
for each row execute function public.shared_inbox_keep_organisation();

create trigger shared_inbox_keep_organisation before update on public.revo_inbox_associations
for each row execute function public.shared_inbox_keep_organisation();

create trigger shared_inbox_keep_organisation before update on public.revo_inbox_channels
for each row execute function public.shared_inbox_keep_organisation();

create trigger shared_inbox_keep_organisation before update on public.revo_inbox_connection_events
for each row execute function public.shared_inbox_keep_organisation();

create trigger shared_inbox_keep_organisation before update on public.revo_inbox_conversations
for each row execute function public.shared_inbox_keep_organisation();

create trigger shared_inbox_keep_organisation before update on public.revo_inbox_escalations
for each row execute function public.shared_inbox_keep_organisation();

create trigger shared_inbox_keep_organisation before update on public.revo_inbox_messages
for each row execute function public.shared_inbox_keep_organisation();

create trigger shared_inbox_keep_organisation before update on public.revo_inbox_provider_connections
for each row execute function public.shared_inbox_keep_organisation();

create trigger shared_inbox_keep_organisation before update on public.revo_inbox_routing_rules
for each row execute function public.shared_inbox_keep_organisation();

create trigger shared_inbox_keep_organisation before update on public.revo_inbox_sla_policies
for each row execute function public.shared_inbox_keep_organisation();

create trigger shared_inbox_keep_organisation before update on public.revo_inbox_sync_runs
for each row execute function public.shared_inbox_keep_organisation();

create trigger shared_inbox_keep_organisation before update on public.revo_inbox_workflow_requests
for each row execute function public.shared_inbox_keep_organisation();

-- The legacy external-ingest endpoint retains its Revo-specific key and scope;
-- enabling Inbox never grants a Revo ingestion key access to other tenants.
commit;
