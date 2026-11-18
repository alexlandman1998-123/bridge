begin;

-- Missing access must never create a shared personal email account. Non-email
-- legacy enquiry channels retain their workspace routing. Existing rows stay put.
alter table public.revo_inbox_channels alter column access_scope drop default;
create function private.shared_inbox_new_channel_access() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.access_scope is null then
    new.access_scope := case when new.channel = 'email' then 'private' else 'workspace' end;
  end if;
  if new.channel = 'email' and new.owner_user_id is null then
    new.owner_user_id := coalesce(auth.uid(),new.created_by);
  end if;
  return new;
end;
$$;
revoke all on function private.shared_inbox_new_channel_access() from public,anon,authenticated;
create trigger aaa_shared_inbox_new_channel_access before insert on public.revo_inbox_channels
for each row execute function private.shared_inbox_new_channel_access();

-- Direct browser inserts remain available for old private setup forms. Shared
-- email creation requires the explicit, authorised command below.
create policy shared_inbox_explicit_email_creation on public.revo_inbox_channels
as restrictive for insert to authenticated
with check (channel <> 'email' or (access_scope = 'private' and owner_user_id = auth.uid()));

create function private.shared_inbox_create_mailbox(
  p_org uuid,p_provider text,p_address text,p_label text,p_scope text,p_confirm_workspace boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare mailbox public.revo_inbox_channels%rowtype;
begin
  if auth.uid() is null or not public.bridge_is_active_member(p_org) then
    raise exception 'Active organisation membership is required';
  end if;
  if p_scope is null or p_scope not in ('private','selected','workspace')
    or p_provider is null or p_provider not in ('google_workspace','microsoft_365','other_email')
    or p_address is null or trim(p_address) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Choose a valid email mailbox and access scope';
  end if;
  if p_scope <> 'private' and not public.bridge_is_org_admin(p_org) then
    raise exception 'Organisation administrator access is required to create a shared mailbox';
  end if;
  if p_scope = 'workspace' and p_confirm_workspace is distinct from true then
    raise exception 'Confirm sharing this mailbox and imported messages with everyone in the organisation';
  end if;
  insert into public.revo_inbox_channels(organisation_id,channel,provider_key,address,display_name,access_scope,owner_user_id,created_by)
    values(p_org,'email',p_provider,lower(trim(p_address)),nullif(trim(p_label),''),p_scope,auth.uid(),auth.uid())
    returning * into mailbox;
  return to_jsonb(mailbox);
end;
$$;
revoke all on function private.shared_inbox_create_mailbox(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function private.shared_inbox_create_mailbox(uuid,text,text,text,text,boolean) to authenticated;
create function public.shared_inbox_create_mailbox(
  p_organisation_id uuid,p_provider_key text,p_address text,p_display_name text,p_access_scope text,p_confirm_workspace_sharing boolean
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.shared_inbox_create_mailbox(p_organisation_id,p_provider_key,p_address,p_display_name,p_access_scope,p_confirm_workspace_sharing);
$$;
revoke all on function public.shared_inbox_create_mailbox(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function public.shared_inbox_create_mailbox(uuid,text,text,text,text,boolean) to authenticated;

-- Scope and ownership changes use the checked command, not a direct table patch.
-- Keep the existing legacy label/connection editing flow and default RPC working.
revoke update on public.revo_inbox_channels from authenticated;
grant update(display_name,connection_status,metadata_json) on public.revo_inbox_channels to authenticated;

create function private.shared_inbox_update_mailbox_access(
  p_org uuid, p_channel uuid, p_scope text, p_owner uuid, p_confirm_workspace boolean
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
  if p_scope = 'workspace' and mailbox.access_scope <> 'workspace' and p_confirm_workspace is distinct from true then
    raise exception 'Confirm sharing this mailbox and its existing messages with everyone in the organisation';
  end if;
  update public.revo_inbox_channels set access_scope = p_scope,
    owner_user_id = coalesce(p_owner,mailbox.owner_user_id,auth.uid()),
    is_default = case when p_scope = 'workspace' then is_default else false end
    where id = p_channel and organisation_id = p_org returning * into mailbox;
  return to_jsonb(mailbox);
end;
$$;
revoke all on function private.shared_inbox_update_mailbox_access(uuid,uuid,text,uuid,boolean) from public,anon;
grant execute on function private.shared_inbox_update_mailbox_access(uuid,uuid,text,uuid,boolean) to authenticated;
create or replace function private.shared_inbox_update_mailbox_access(p_org uuid,p_channel uuid,p_scope text,p_owner uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.shared_inbox_update_mailbox_access(p_org,p_channel,p_scope,p_owner,false);
$$;
create function public.shared_inbox_update_mailbox_access(
  p_organisation_id uuid,p_channel_id uuid,p_access_scope text,p_owner_user_id uuid,p_confirm_workspace_sharing boolean
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.shared_inbox_update_mailbox_access(p_organisation_id,p_channel_id,p_access_scope,p_owner_user_id,p_confirm_workspace_sharing);
$$;
revoke all on function public.shared_inbox_update_mailbox_access(uuid,uuid,text,uuid,boolean) from public,anon;
grant execute on function public.shared_inbox_update_mailbox_access(uuid,uuid,text,uuid,boolean) to authenticated;

commit;
