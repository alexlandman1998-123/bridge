begin;

create or replace function public.bridge_normalize_organization_identity(p_value text)
returns text
language sql
immutable
as $$
  with normalized as (
    select regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(trim(coalesce(p_value, ''))), '&', ' and ', 'g'),
          '\mrealty\M',
          'real estate',
          'g'
        ),
        '\mproperties\M',
        'property',
        'g'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    ) as value
  ),
  stripped as (
    select regexp_replace(
      value,
      '\m(pty|ltd|limited|inc|incorporated|cc|company|co|sa|south africa)\M',
      ' ',
      'g'
    ) as value
    from normalized
  )
  select nullif(trim(regexp_replace(value, '\s+', ' ', 'g')), '')
  from stripped;
$$;

create or replace function public.bridge_normalize_organization_registration(p_value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(trim(coalesce(p_value, ''))), '[^a-z0-9]+', '', 'g'), '');
$$;

create or replace function public.bridge_normalize_organization_domain(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v_value text := lower(trim(coalesce(p_value, '')));
  v_domain text;
begin
  if v_value = '' then
    return null;
  end if;

  if position('@' in v_value) > 0 then
    v_value := split_part(v_value, '@', 2);
  end if;

  v_domain := regexp_replace(v_value, '^mailto:', '');
  v_domain := regexp_replace(v_domain, '^https?://', '');
  v_domain := split_part(v_domain, '/', 1);
  v_domain := split_part(v_domain, '?', 1);
  v_domain := split_part(v_domain, '#', 1);
  v_domain := regexp_replace(v_domain, '^www\.', '');
  v_domain := nullif(trim(v_domain), '');

  if v_domain is null or v_domain in (
    'aol.com',
    'gmail.com',
    'hotmail.com',
    'icloud.com',
    'live.com',
    'me.com',
    'msn.com',
    'outlook.com',
    'proton.me',
    'protonmail.com',
    'yahoo.com'
  ) then
    return null;
  end if;

  return v_domain;
end;
$$;

create or replace function public.bridge_prevent_duplicate_active_organisation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_type text := coalesce(nullif(new.organization_type, ''), nullif(new.type, ''), '');
  v_identity text := public.bridge_normalize_organization_identity(coalesce(new.legal_name, new.name, new.display_name));
  v_registration text := public.bridge_normalize_organization_registration(new.registration_number);
  v_email_domain text := coalesce(
    public.bridge_normalize_organization_domain(new.email),
    public.bridge_normalize_organization_domain(new.company_email),
    public.bridge_normalize_organization_domain(new.support_email),
    public.bridge_normalize_organization_domain(new.billing_email)
  );
  v_website_domain text := public.bridge_normalize_organization_domain(new.website);
  v_existing_org_id uuid;
begin
  if coalesce(new.status, 'active') not in ('active', 'pending') then
    return new;
  end if;

  if v_identity is null and v_registration is null and v_email_domain is null and v_website_domain is null then
    return new;
  end if;

  select existing.id
    into v_existing_org_id
    from public.organisations existing
   where existing.id is distinct from new.id
     and coalesce(existing.status, 'active') in ('active', 'pending')
     and coalesce(nullif(existing.organization_type, ''), nullif(existing.type, ''), '') = v_workspace_type
     and (
       (
         v_identity is not null
         and public.bridge_normalize_organization_identity(coalesce(existing.legal_name, existing.name, existing.display_name)) = v_identity
       )
       or (
         v_registration is not null
         and public.bridge_normalize_organization_registration(existing.registration_number) = v_registration
       )
       or (
         v_email_domain is not null
         and coalesce(
           public.bridge_normalize_organization_domain(existing.email),
           public.bridge_normalize_organization_domain(existing.company_email),
           public.bridge_normalize_organization_domain(existing.support_email),
           public.bridge_normalize_organization_domain(existing.billing_email)
         ) = v_email_domain
       )
       or (
         v_website_domain is not null
         and public.bridge_normalize_organization_domain(existing.website) = v_website_domain
       )
     )
   limit 1;

  if v_existing_org_id is not null then
    raise exception 'duplicate_organisation_detected'
      using
        errcode = '23505',
        detail = jsonb_build_object(
          'existingOrganisationId', v_existing_org_id,
          'candidateName', coalesce(new.display_name, new.name),
          'candidateType', v_workspace_type
        )::text,
        hint = 'Use the existing active organisation instead of creating a duplicate.';
  end if;

  return new;
end;
$$;

drop trigger if exists organisations_prevent_duplicate_active on public.organisations;
create trigger organisations_prevent_duplicate_active
before insert or update of
  name,
  display_name,
  legal_name,
  registration_number,
  email,
  company_email,
  support_email,
  billing_email,
  website,
  type,
  organization_type,
  status
on public.organisations
for each row
execute function public.bridge_prevent_duplicate_active_organisation();

commit;
