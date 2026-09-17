-- Private Property production access is operated by Arch9, not by agencies.
-- Secrets live in Supabase Vault and can only be accessed by service-role code.
create extension if not exists supabase_vault with schema vault;

alter table public.private_property_agency_configs
  add column if not exists username_secret_id uuid,
  add column if not exists password_secret_id uuid,
  add column if not exists credentials_updated_at timestamptz;

create or replace function public.set_private_property_agency_credentials(
  p_config_id uuid,
  p_username text,
  p_password text
)
returns table (credentials_configured boolean, credentials_updated_at timestamptz)
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_config public.private_property_agency_configs%rowtype;
  v_username_secret_id uuid;
  v_password_secret_id uuid;
begin
  if p_config_id is null then
    raise exception 'Private Property connection ID is required.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_username, '')), '') is null or nullif(trim(coalesce(p_password, '')), '') is null then
    raise exception 'Private Property username and password are required.' using errcode = '22023';
  end if;

  select * into v_config from public.private_property_agency_configs where id = p_config_id for update;
  if not found then
    raise exception 'Save the Private Property connection before its credentials.' using errcode = '23503';
  end if;

  if v_config.username_secret_id is null then
    v_username_secret_id := vault.create_secret(trim(p_username), format('private-property:%s:username', p_config_id), 'Private Property API username');
  else
    perform vault.update_secret(v_config.username_secret_id, trim(p_username));
    v_username_secret_id := v_config.username_secret_id;
  end if;
  if v_config.password_secret_id is null then
    v_password_secret_id := vault.create_secret(trim(p_password), format('private-property:%s:password', p_config_id), 'Private Property API password');
  else
    perform vault.update_secret(v_config.password_secret_id, trim(p_password));
    v_password_secret_id := v_config.password_secret_id;
  end if;

  update public.private_property_agency_configs
  set username_secret_id = v_username_secret_id,
      password_secret_id = v_password_secret_id,
      credentials_updated_at = now()
  where id = p_config_id
  returning true, public.private_property_agency_configs.credentials_updated_at into credentials_configured, credentials_updated_at;
  return next;
end;
$$;

create or replace function public.get_private_property_agency_credentials(p_config_id uuid)
returns table (username text, password text)
language sql
security definer
set search_path = public, vault, pg_temp
stable
as $$
  select username.decrypted_secret, password.decrypted_secret
  from public.private_property_agency_configs config
  join vault.decrypted_secrets username on username.id = config.username_secret_id
  join vault.decrypted_secrets password on password.id = config.password_secret_id
  where config.id = p_config_id
  limit 1;
$$;

revoke all on function public.set_private_property_agency_credentials(uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_private_property_agency_credentials(uuid) from public, anon, authenticated;
grant execute on function public.set_private_property_agency_credentials(uuid, text, text) to service_role;
grant execute on function public.get_private_property_agency_credentials(uuid) to service_role;

comment on column public.private_property_agency_configs.username_secret_id is 'Supabase Vault secret ID; never returned to browsers.';
comment on column public.private_property_agency_configs.password_secret_id is 'Supabase Vault secret ID; never returned to browsers.';
