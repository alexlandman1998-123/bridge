-- Keep each agency's Property24 API credentials encrypted at rest.  The
-- application can only read them through the two service-role-only routines
-- below; they are never exposed through the public schema or browser API.
create extension if not exists supabase_vault with schema vault;

alter table public.property24_accounts
  add column if not exists username_secret_id uuid,
  add column if not exists password_secret_id uuid,
  add column if not exists user_group_id text,
  add column if not exists credentials_updated_at timestamptz;

create or replace function public.set_property24_account_credentials(
  p_organisation_id uuid,
  p_environment text,
  p_username text,
  p_password text,
  p_user_group_id text default null
)
returns table (credentials_configured boolean, credentials_updated_at timestamptz)
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_account public.property24_accounts%rowtype;
  v_username_secret_id uuid;
  v_password_secret_id uuid;
  v_environment text := lower(trim(coalesce(p_environment, '')));
begin
  if p_organisation_id is null then
    raise exception 'Organisation ID is required.' using errcode = '22023';
  end if;
  if v_environment not in ('production', 'exdev') then
    raise exception 'Property24 environment must be production or exdev.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_username, '')), '') is null or nullif(trim(coalesce(p_password, '')), '') is null then
    raise exception 'Property24 username and password are required.' using errcode = '22023';
  end if;

  select * into v_account
  from public.property24_accounts
  where organisation_id = p_organisation_id and environment = v_environment
  for update;
  if not found then
    raise exception 'Save the Property24 agency connection before its credentials.' using errcode = '23503';
  end if;

  if v_account.username_secret_id is null then
    v_username_secret_id := vault.create_secret(
      trim(p_username),
      format('property24:%s:%s:username', p_organisation_id, v_environment),
      'Property24 organisation API username'
    );
  else
    perform vault.update_secret(v_account.username_secret_id, trim(p_username));
    v_username_secret_id := v_account.username_secret_id;
  end if;

  if v_account.password_secret_id is null then
    v_password_secret_id := vault.create_secret(
      trim(p_password),
      format('property24:%s:%s:password', p_organisation_id, v_environment),
      'Property24 organisation API password'
    );
  else
    perform vault.update_secret(v_account.password_secret_id, trim(p_password));
    v_password_secret_id := v_account.password_secret_id;
  end if;

  update public.property24_accounts
  set username_secret_id = v_username_secret_id,
      password_secret_id = v_password_secret_id,
      user_group_id = nullif(trim(coalesce(p_user_group_id, '')), ''),
      credentials_updated_at = now()
  where id = v_account.id
  returning true, public.property24_accounts.credentials_updated_at
  into credentials_configured, credentials_updated_at;
  return next;
end;
$$;

create or replace function public.get_property24_account_credentials(
  p_organisation_id uuid,
  p_environment text
)
returns table (username text, password text, user_group_id text)
language sql
security definer
set search_path = public, vault, pg_temp
stable
as $$
  select username.decrypted_secret, password.decrypted_secret, account.user_group_id
  from public.property24_accounts account
  join vault.decrypted_secrets username on username.id = account.username_secret_id
  join vault.decrypted_secrets password on password.id = account.password_secret_id
  where account.organisation_id = p_organisation_id
    and account.environment = lower(trim(coalesce(p_environment, '')))
  limit 1;
$$;

revoke all on function public.set_property24_account_credentials(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_property24_account_credentials(uuid, text) from public, anon, authenticated;
grant execute on function public.set_property24_account_credentials(uuid, text, text, text, text) to service_role;
grant execute on function public.get_property24_account_credentials(uuid, text) to service_role;

comment on column public.property24_accounts.username_secret_id is 'Supabase Vault secret ID; never returned to browsers.';
comment on column public.property24_accounts.password_secret_id is 'Supabase Vault secret ID; never returned to browsers.';
