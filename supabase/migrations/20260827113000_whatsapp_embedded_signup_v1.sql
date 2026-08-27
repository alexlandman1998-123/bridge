begin;

alter table public.organisation_communication_channels
  add column if not exists meta_access_token_secret_id uuid;

alter table public.organisation_communication_channels
  alter column meta_access_token drop not null;

do $$
begin
  alter table public.organisation_communication_channels
    drop constraint if exists organisation_communication_channels_connection_status_check;
exception
  when undefined_object then null;
end;
$$;

alter table public.organisation_communication_channels
  add constraint organisation_communication_channels_connection_status_check
    check (connection_status in (
      'pending',
      'connecting',
      'connected',
      'action_required',
      'disconnected',
      'error'
    ));

create unique index if not exists organisation_communication_channels_scope_branch_unique_idx
  on public.organisation_communication_channels (
    organisation_id,
    branch_id,
    provider,
    channel_type
  )
  where provider = 'meta'
    and channel_type = 'whatsapp'
    and branch_id is not null;

create unique index if not exists organisation_communication_channels_scope_agency_unique_idx
  on public.organisation_communication_channels (
    organisation_id,
    provider,
    channel_type
  )
  where provider = 'meta'
    and channel_type = 'whatsapp'
    and branch_id is null;

create or replace function public.bridge_store_whatsapp_access_token_secret(
  p_secret_id uuid,
  p_access_token text,
  p_secret_name text default null,
  p_secret_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid := p_secret_id;
  v_secret_name text := nullif(trim(coalesce(p_secret_name, '')), '');
  v_secret_description text := nullif(trim(coalesce(p_secret_description, '')), '');
begin
  if nullif(trim(coalesce(p_access_token, '')), '') is null then
    raise exception 'WhatsApp access token is required.' using errcode = '22023';
  end if;

  if v_secret_id is null then
    select vault.create_secret(
      p_access_token,
      v_secret_name,
      v_secret_description
    ) into v_secret_id;
  else
    perform vault.update_secret(
      v_secret_id,
      p_access_token,
      v_secret_name,
      v_secret_description
    );
  end if;

  return v_secret_id;
end;
$$;

create or replace function public.bridge_resolve_whatsapp_access_token(
  p_secret_id uuid,
  p_fallback_token text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare
  v_token text := null;
begin
  if p_secret_id is not null then
    select decrypted_secret
      into v_token
    from vault.decrypted_secrets
    where id = p_secret_id;
  end if;

  return coalesce(nullif(trim(coalesce(v_token, '')), ''), nullif(trim(coalesce(p_fallback_token, '')), ''), '');
end;
$$;

revoke all on function public.bridge_store_whatsapp_access_token_secret(uuid, text, text, text) from public;
revoke all on function public.bridge_resolve_whatsapp_access_token(uuid, text) from public;
grant execute on function public.bridge_store_whatsapp_access_token_secret(uuid, text, text, text) to service_role;
grant execute on function public.bridge_resolve_whatsapp_access_token(uuid, text) to service_role;

do $$
declare
  r record;
  v_secret_id uuid;
begin
  for r in
    select
      id,
      organisation_id,
      branch_id,
      meta_access_token
    from public.organisation_communication_channels
    where meta_access_token_secret_id is null
      and nullif(trim(coalesce(meta_access_token, '')), '') is not null
  loop
    select public.bridge_store_whatsapp_access_token_secret(
      null,
      r.meta_access_token,
      format(
        'whatsapp:%s:%s',
        r.organisation_id,
        coalesce(r.branch_id::text, 'agency')
      ),
      'WhatsApp embedded signup access token'
    ) into v_secret_id;

    update public.organisation_communication_channels
    set
      meta_access_token_secret_id = v_secret_id,
      meta_access_token = null
    where id = r.id;
  end loop;
end;
$$;

alter table public.notification_provider_webhook_events
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists organisation_communication_channel_id uuid references public.organisation_communication_channels(id) on delete set null,
  add column if not exists waba_id text,
  add column if not exists phone_number_id text,
  add column if not exists display_phone_number text,
  add column if not exists business_display_name text,
  add column if not exists verification_status text;

create index if not exists notification_provider_webhook_phone_idx
  on public.notification_provider_webhook_events (phone_number_id, received_at desc)
  where phone_number_id is not null;

create index if not exists notification_provider_webhook_org_idx
  on public.notification_provider_webhook_events (organisation_id, branch_id, received_at desc)
  where organisation_id is not null;

notify pgrst, 'reload schema';

commit;
