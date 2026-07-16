begin;
create or replace function public.bridge_update_attorney_organisation_identity_v3(
  target_firm_id uuid,
  identity_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_firm public.attorney_firms%rowtype;
  v_org public.organisations%rowtype;
  v_org_id uuid;
  v_name text;
begin
  if target_firm_id is null then
    raise exception 'Attorney firm id is required.' using errcode = '22023';
  end if;
  if identity_patch is null or jsonb_typeof(identity_patch) is distinct from 'object' then
    raise exception 'Attorney organisation identity patch must be an object.' using errcode = '22023';
  end if;

  select *
  into v_firm
  from public.attorney_firms
  where id = target_firm_id
  for update;

  if not found then
    raise exception 'Attorney firm was not found.' using errcode = 'P0002';
  end if;

  if v_actor_id is null or (
    v_firm.created_by is distinct from v_actor_id
    and not exists (
      select 1
      from public.attorney_firm_members member
      where member.firm_id = target_firm_id
        and member.user_id = v_actor_id
        and member.status = 'active'
        and member.role in ('firm_admin', 'director_partner')
    )
  ) then
    raise exception 'Permission denied for attorney organisation update.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_firm_id::text, 0));
  v_org_id := public.bridge_ensure_attorney_firm_organisation(target_firm_id);

  if identity_patch ? 'name' then
    v_name := nullif(trim(identity_patch ->> 'name'), '');
    if v_name is null then
      raise exception 'Firm name is required.' using errcode = '22023';
    end if;
  end if;

  update public.organisations
  set
    name = case when identity_patch ? 'name' then v_name else name end,
    display_name = case when identity_patch ? 'name' then v_name else display_name end,
    legal_name = case when identity_patch ? 'name' then v_name else legal_name end,
    registration_number = case when identity_patch ? 'registration_number' then nullif(trim(identity_patch ->> 'registration_number'), '') else registration_number end,
    vat_number = case when identity_patch ? 'vat_number' then nullif(trim(identity_patch ->> 'vat_number'), '') else vat_number end,
    company_email = case when identity_patch ? 'company_email' then nullif(lower(trim(identity_patch ->> 'company_email')), '') else company_email end,
    support_email = case when identity_patch ? 'company_email' then nullif(lower(trim(identity_patch ->> 'company_email')), '') else support_email end,
    company_phone = case when identity_patch ? 'company_phone' then nullif(trim(identity_patch ->> 'company_phone'), '') else company_phone end,
    support_phone = case when identity_patch ? 'company_phone' then nullif(trim(identity_patch ->> 'company_phone'), '') else support_phone end,
    website = case when identity_patch ? 'website' then nullif(trim(identity_patch ->> 'website'), '') else website end,
    address = case when identity_patch ? 'address_line_1' then nullif(trim(identity_patch ->> 'address_line_1'), '') else address end,
    address_line_1 = case when identity_patch ? 'address_line_1' then nullif(trim(identity_patch ->> 'address_line_1'), '') else address_line_1 end,
    address_line_2 = case when identity_patch ? 'address_line_2' then nullif(trim(identity_patch ->> 'address_line_2'), '') else address_line_2 end,
    city = case when identity_patch ? 'city' then nullif(trim(identity_patch ->> 'city'), '') else city end,
    province = case when identity_patch ? 'province' then nullif(trim(identity_patch ->> 'province'), '') else province end,
    postal_code = case when identity_patch ? 'postal_code' then nullif(trim(identity_patch ->> 'postal_code'), '') else postal_code end,
    country = case when identity_patch ? 'country' then coalesce(nullif(trim(identity_patch ->> 'country'), ''), 'South Africa') else country end,
    logo_url = case when identity_patch ? 'logo_url' then nullif(trim(identity_patch ->> 'logo_url'), '') else logo_url end,
    logo_bucket = case when identity_patch ? 'logo_bucket' then nullif(trim(identity_patch ->> 'logo_bucket'), '') else logo_bucket end,
    logo_path = case when identity_patch ? 'logo_path' then nullif(trim(identity_patch ->> 'logo_path'), '') else logo_path end,
    logo_dark_url = case when identity_patch ? 'logo_dark_url' then nullif(trim(identity_patch ->> 'logo_dark_url'), '') else logo_dark_url end,
    logo_dark_bucket = case when identity_patch ? 'logo_dark_bucket' then nullif(trim(identity_patch ->> 'logo_dark_bucket'), '') else logo_dark_bucket end,
    logo_dark_path = case when identity_patch ? 'logo_dark_path' then nullif(trim(identity_patch ->> 'logo_dark_path'), '') else logo_dark_path end,
    primary_colour = case when identity_patch ? 'primary_colour' then nullif(trim(identity_patch ->> 'primary_colour'), '') else primary_colour end,
    secondary_colour = case when identity_patch ? 'secondary_colour' then nullif(trim(identity_patch ->> 'secondary_colour'), '') else secondary_colour end,
    type = 'attorney_firm',
    workspace_kind = 'attorney_firm',
    settings_json = coalesce(settings_json, '{}'::jsonb) || jsonb_build_object(
      'attorneyFirmId', target_firm_id,
      'attorneyCanonicalWriteVersion', 3,
      'attorneyCanonicalUpdatedAt', now()
    ),
    updated_at = now()
  where id = v_org_id
  returning * into v_org;

  if v_org.id is null then
    raise exception 'Backing attorney organisation was not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'success', true,
    'firm_id', target_firm_id,
    'organisation_id', v_org_id,
    'organisation', to_jsonb(v_org)
  );
end;
$$;
revoke all on function public.bridge_update_attorney_organisation_identity_v3(uuid, jsonb) from public;
grant execute on function public.bridge_update_attorney_organisation_identity_v3(uuid, jsonb) to authenticated;
commit;
