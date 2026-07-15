begin;

create or replace function public.bridge_reconcile_attorney_firm_organisation(
  target_firm_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_firm public.attorney_firms%rowtype;
  v_branding public.attorney_firm_branding%rowtype;
  v_org public.organisations%rowtype;
  v_org_id uuid;
  v_now timestamptz := now();
begin
  if target_firm_id is null then
    raise exception 'Attorney firm id is required.' using errcode = '22023';
  end if;

  select *
  into v_firm
  from public.attorney_firms
  where id = target_firm_id
  for update;

  if not found then
    raise exception 'Attorney firm was not found.' using errcode = 'P0002';
  end if;

  if v_actor_id is not null
    and v_firm.created_by is distinct from v_actor_id
    and not exists (
      select 1
      from public.attorney_firm_members member
      where member.firm_id = target_firm_id
        and member.user_id = v_actor_id
        and member.status = 'active'
        and member.role in ('firm_admin', 'director_partner')
    )
  then
    raise exception 'Permission denied for attorney organisation reconciliation.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_firm_id::text, 0));
  v_org_id := public.bridge_ensure_attorney_firm_organisation(target_firm_id);

  select *
  into v_branding
  from public.attorney_firm_branding
  where firm_id = target_firm_id;

  update public.organisations
  set
    name = coalesce(nullif(trim(name), ''), nullif(trim(v_firm.name), ''), 'Attorney Firm'),
    display_name = coalesce(nullif(trim(display_name), ''), nullif(trim(v_firm.name), ''), 'Attorney Firm'),
    legal_name = coalesce(nullif(trim(legal_name), ''), nullif(trim(v_firm.name), ''), 'Attorney Firm'),
    registration_number = coalesce(nullif(trim(registration_number), ''), nullif(trim(v_firm.registration_number), '')),
    vat_number = coalesce(nullif(trim(vat_number), ''), nullif(trim(v_firm.vat_number), '')),
    type = 'attorney_firm',
    workspace_kind = 'attorney_firm',
    company_email = coalesce(nullif(lower(trim(company_email)), ''), nullif(lower(trim(v_firm.email)), '')),
    company_phone = coalesce(nullif(trim(company_phone), ''), nullif(trim(v_firm.phone), '')),
    website = coalesce(nullif(trim(website), ''), nullif(trim(v_firm.website), '')),
    address = coalesce(nullif(trim(address), ''), nullif(trim(v_firm.address_line_1), '')),
    address_line_1 = coalesce(nullif(trim(address_line_1), ''), nullif(trim(v_firm.address_line_1), '')),
    address_line_2 = coalesce(nullif(trim(address_line_2), ''), nullif(trim(v_firm.address_line_2), '')),
    formatted_address = coalesce(
      nullif(trim(formatted_address), ''),
      nullif(trim(concat_ws(', ',
        nullif(trim(v_firm.address_line_1), ''),
        nullif(trim(v_firm.address_line_2), ''),
        nullif(trim(v_firm.city), ''),
        nullif(trim(v_firm.province), ''),
        nullif(trim(v_firm.postal_code), '')
      )), '')
    ),
    city = coalesce(nullif(trim(city), ''), nullif(trim(v_firm.city), '')),
    province = coalesce(nullif(trim(province), ''), nullif(trim(v_firm.province), '')),
    postal_code = coalesce(nullif(trim(postal_code), ''), nullif(trim(v_firm.postal_code), '')),
    country = coalesce(nullif(trim(country), ''), nullif(trim(v_firm.country), ''), 'South Africa'),
    logo_url = coalesce(nullif(trim(logo_url), ''), nullif(trim(v_branding.logo_url), ''), nullif(trim(v_firm.logo_url), '')),
    logo_bucket = coalesce(nullif(trim(logo_bucket), ''), nullif(trim(v_branding.logo_bucket), '')),
    logo_path = coalesce(nullif(trim(logo_path), ''), nullif(trim(v_branding.logo_path), '')),
    logo_dark_url = coalesce(nullif(trim(logo_dark_url), ''), nullif(trim(v_branding.logo_dark_url), '')),
    logo_dark_bucket = coalesce(nullif(trim(logo_dark_bucket), ''), nullif(trim(v_branding.logo_dark_bucket), '')),
    logo_dark_path = coalesce(nullif(trim(logo_dark_path), ''), nullif(trim(v_branding.logo_dark_path), '')),
    primary_colour = coalesce(nullif(trim(primary_colour), ''), nullif(trim(v_branding.primary_colour), ''), nullif(trim(v_firm.primary_colour), '')),
    secondary_colour = coalesce(nullif(trim(secondary_colour), ''), nullif(trim(v_branding.secondary_colour), ''), nullif(trim(v_firm.secondary_colour), '')),
    support_email = coalesce(nullif(lower(trim(support_email)), ''), nullif(lower(trim(v_firm.email)), '')),
    support_phone = coalesce(nullif(trim(support_phone), ''), nullif(trim(v_firm.phone), '')),
    status = case when v_firm.is_active then 'active' else 'suspended' end,
    settings_json = coalesce(settings_json, '{}'::jsonb) || jsonb_build_object(
      'workspaceType', 'attorney_firm',
      'attorneyFirmId', target_firm_id,
      'attorneyOrganisationReconciledAt', v_now,
      'attorneyOrganisationReconciliationSource', 'phase3_canonical_precedence'
    ),
    updated_at = v_now
  where id = v_org_id
  returning * into v_org;

  update public.attorney_firms
  set
    organisation_id = v_org_id,
    name = v_org.name,
    registration_number = v_org.registration_number,
    vat_number = v_org.vat_number,
    website = v_org.website,
    email = v_org.company_email,
    phone = v_org.company_phone,
    address_line_1 = v_org.address_line_1,
    address_line_2 = v_org.address_line_2,
    city = v_org.city,
    province = v_org.province,
    postal_code = v_org.postal_code,
    country = coalesce(nullif(trim(v_org.country), ''), 'South Africa'),
    logo_url = v_org.logo_url,
    primary_colour = v_org.primary_colour,
    secondary_colour = v_org.secondary_colour,
    updated_at = v_now
  where id = target_firm_id
  returning * into v_firm;

  insert into public.attorney_firm_branding (
    firm_id,
    logo_url,
    logo_bucket,
    logo_path,
    logo_dark_url,
    logo_dark_bucket,
    logo_dark_path,
    primary_colour,
    secondary_colour,
    created_by
  )
  values (
    target_firm_id,
    v_org.logo_url,
    v_org.logo_bucket,
    v_org.logo_path,
    v_org.logo_dark_url,
    v_org.logo_dark_bucket,
    v_org.logo_dark_path,
    v_org.primary_colour,
    v_org.secondary_colour,
    v_firm.created_by
  )
  on conflict (firm_id)
  do update set
    logo_url = excluded.logo_url,
    logo_bucket = excluded.logo_bucket,
    logo_path = excluded.logo_path,
    logo_dark_url = excluded.logo_dark_url,
    logo_dark_bucket = excluded.logo_dark_bucket,
    logo_dark_path = excluded.logo_dark_path,
    primary_colour = excluded.primary_colour,
    secondary_colour = excluded.secondary_colour,
    updated_at = v_now
  returning * into v_branding;

  insert into public.organisation_settings (organisation_id, settings_json)
  values (
    v_org_id,
    jsonb_build_object(
      'workspaceType', 'attorney_firm',
      'attorneyFirmId', target_firm_id,
      'attorneyOrganisationReconciledAt', v_now
    )
  )
  on conflict (organisation_id)
  do update set
    settings_json = coalesce(public.organisation_settings.settings_json, '{}'::jsonb) || excluded.settings_json,
    updated_at = v_now;

  return jsonb_build_object(
    'success', true,
    'firm_id', target_firm_id,
    'organisation_id', v_org_id,
    'firm', to_jsonb(v_firm),
    'organisation', to_jsonb(v_org),
    'branding', to_jsonb(v_branding)
  );
end;
$$;

create or replace function public.bridge_sync_attorney_organisation_to_legacy_firm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_firm_id uuid;
  v_created_by uuid;
begin
  if new.type is distinct from 'attorney_firm' then
    return new;
  end if;

  select firm.id, firm.created_by
  into v_firm_id, v_created_by
  from public.attorney_firms firm
  where firm.organisation_id = new.id
     or (firm.organisation_id is null and firm.id = new.id)
  order by (firm.organisation_id = new.id) desc
  limit 1;

  if v_firm_id is null then
    return new;
  end if;

  update public.attorney_firms
  set
    organisation_id = new.id,
    name = coalesce(nullif(trim(new.name), ''), name),
    registration_number = new.registration_number,
    vat_number = new.vat_number,
    website = new.website,
    email = new.company_email,
    phone = new.company_phone,
    address_line_1 = new.address_line_1,
    address_line_2 = new.address_line_2,
    city = new.city,
    province = new.province,
    postal_code = new.postal_code,
    country = coalesce(nullif(trim(new.country), ''), 'South Africa'),
    logo_url = new.logo_url,
    primary_colour = new.primary_colour,
    secondary_colour = new.secondary_colour,
    updated_at = now()
  where id = v_firm_id;

  insert into public.attorney_firm_branding (
    firm_id,
    logo_url,
    logo_bucket,
    logo_path,
    logo_dark_url,
    logo_dark_bucket,
    logo_dark_path,
    primary_colour,
    secondary_colour,
    created_by
  )
  values (
    v_firm_id,
    new.logo_url,
    new.logo_bucket,
    new.logo_path,
    new.logo_dark_url,
    new.logo_dark_bucket,
    new.logo_dark_path,
    new.primary_colour,
    new.secondary_colour,
    v_created_by
  )
  on conflict (firm_id)
  do update set
    logo_url = excluded.logo_url,
    logo_bucket = excluded.logo_bucket,
    logo_path = excluded.logo_path,
    logo_dark_url = excluded.logo_dark_url,
    logo_dark_bucket = excluded.logo_dark_bucket,
    logo_dark_path = excluded.logo_dark_path,
    primary_colour = excluded.primary_colour,
    secondary_colour = excluded.secondary_colour,
    updated_at = now();

  return new;
end;
$$;

do $$
declare
  firm_record record;
begin
  for firm_record in
    select id from public.attorney_firms order by created_at, id
  loop
    perform public.bridge_reconcile_attorney_firm_organisation(firm_record.id);
  end loop;
end;
$$;

drop trigger if exists organisations_sync_attorney_identity_to_legacy on public.organisations;
create trigger organisations_sync_attorney_identity_to_legacy
after insert or update of
  name,
  registration_number,
  vat_number,
  company_email,
  company_phone,
  website,
  address_line_1,
  address_line_2,
  city,
  province,
  postal_code,
  country,
  logo_url,
  logo_bucket,
  logo_path,
  logo_dark_url,
  logo_dark_bucket,
  logo_dark_path,
  primary_colour,
  secondary_colour
on public.organisations
for each row
execute function public.bridge_sync_attorney_organisation_to_legacy_firm();

revoke all on function public.bridge_reconcile_attorney_firm_organisation(uuid) from public;
grant execute on function public.bridge_reconcile_attorney_firm_organisation(uuid) to authenticated;
revoke all on function public.bridge_sync_attorney_organisation_to_legacy_firm() from public;

commit;
