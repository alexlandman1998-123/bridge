begin;

-- Attorney Matters visibility is keyed by attorney_firms and
-- attorney_firm_members. Older workspace onboarding could create only the
-- organisations / organisation_users side of that relationship, leaving an
-- otherwise valid attorney workspace impossible to nominate on a transaction.
create or replace function public.bridge_ensure_attorney_firm_for_workspace(
  p_organisation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organisation public.organisations%rowtype;
  v_firm public.attorney_firms%rowtype;
  v_preferred_firm_id uuid;
begin
  if p_organisation_id is null then
    raise exception 'attorney workspace organisation is required' using errcode = '22023';
  end if;

  select organisation.* into v_organisation
  from public.organisations organisation
  where organisation.id = p_organisation_id
    and lower(coalesce(organisation.status, 'active')) = 'active'
    and lower(coalesce(
      organisation.workspace_kind,
      organisation.settings_json ->> 'workspaceKind',
      organisation.settings_json ->> 'workspaceType',
      organisation.type,
      organisation.organization_type,
      ''
    )) in ('attorney_firm', 'attorney');

  if not found then
    raise exception 'selected organisation is not an active attorney workspace'
      using errcode = '22023';
  end if;

  select firm.* into v_firm
  from public.attorney_firms firm
  where firm.organisation_id = p_organisation_id
  order by coalesce(firm.is_active, true) desc, firm.updated_at desc nulls last, firm.id
  limit 1
  for update;

  if not found then
    if coalesce(
      v_organisation.settings_json ->> 'attorneyFirmId',
      v_organisation.settings_json ->> 'attorney_firm_id',
      ''
    ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      v_preferred_firm_id := coalesce(
        v_organisation.settings_json ->> 'attorneyFirmId',
        v_organisation.settings_json ->> 'attorney_firm_id'
      )::uuid;
      if exists (select 1 from public.attorney_firms where id = v_preferred_firm_id) then
        v_preferred_firm_id := null;
      end if;
    end if;

    insert into public.attorney_firms (
      id,
      name,
      registration_number,
      vat_number,
      website,
      email,
      phone,
      address_line_1,
      address_line_2,
      city,
      province,
      postal_code,
      country,
      logo_url,
      primary_colour,
      secondary_colour,
      created_by,
      is_active,
      organisation_id,
      is_demo_data
    ) values (
      coalesce(v_preferred_firm_id, gen_random_uuid()),
      coalesce(nullif(v_organisation.display_name, ''), nullif(v_organisation.legal_name, ''), v_organisation.name),
      v_organisation.registration_number,
      v_organisation.vat_number,
      v_organisation.website,
      lower(coalesce(
        nullif(v_organisation.company_email, ''),
        nullif(v_organisation.email, ''),
        nullif(v_organisation.support_email, '')
      )),
      coalesce(nullif(v_organisation.company_phone, ''), nullif(v_organisation.phone, ''), nullif(v_organisation.support_phone, '')),
      v_organisation.address_line_1,
      v_organisation.address_line_2,
      v_organisation.city,
      v_organisation.province,
      v_organisation.postal_code,
      coalesce(nullif(v_organisation.country, ''), 'South Africa'),
      v_organisation.logo_url,
      v_organisation.primary_colour,
      v_organisation.secondary_colour,
      v_organisation.created_by,
      true,
      v_organisation.id,
      coalesce(v_organisation.is_demo_data, false)
    )
    returning * into v_firm;
  elsif coalesce(v_firm.is_active, true) = false then
    update public.attorney_firms
    set is_active = true, updated_at = now()
    where id = v_firm.id
    returning * into v_firm;
  end if;

  -- Do not overwrite established firm-specific roles. Only fill the missing
  -- projection from active attorney workspace memberships.
  insert into public.attorney_firm_members (
    firm_id,
    user_id,
    role,
    status,
    joined_at,
    organisation_user_id,
    branch_id,
    primary_branch_id,
    branch_scope,
    professional_role,
    practice_qualifications
  )
  select
    v_firm.id,
    member.user_id,
    case
      when lower(coalesce(member.workspace_role, member.organisation_role, member.role, '')) in
        ('owner', 'admin', 'firm_admin', 'principal', 'director', 'partner') then 'firm_admin'
      when lower(coalesce(member.workspace_role, member.organisation_role, member.role, '')) in
        ('candidate_attorney', 'candidate') then 'candidate_attorney'
      when lower(coalesce(member.workspace_role, member.organisation_role, member.role, '')) in
        ('conveyancing_secretary', 'secretary') then 'conveyancing_secretary'
      when lower(coalesce(member.workspace_role, member.organisation_role, member.role, '')) in
        ('admin_staff', 'administrator') then 'admin_staff'
      else 'transfer_attorney'
    end,
    'active',
    coalesce(member.accepted_at, member.created_at, now()),
    member.id,
    member.branch_id,
    member.primary_branch_id,
    case
      when lower(coalesce(member.branch_scope, '')) in ('own', 'assigned_branch', 'all_branches')
        then lower(member.branch_scope)
      when lower(coalesce(member.workspace_role, member.organisation_role, member.role, '')) in
        ('owner', 'admin', 'firm_admin', 'principal', 'director', 'partner') then 'all_branches'
      else 'assigned_branch'
    end,
    case
      when lower(coalesce(member.workspace_role, member.organisation_role, member.role, '')) in
        ('owner', 'admin', 'firm_admin', 'principal') then 'firm_admin'
      when lower(coalesce(member.workspace_role, member.organisation_role, member.role, '')) in
        ('director', 'partner') then 'director_partner'
      when lower(coalesce(member.workspace_role, member.organisation_role, member.role, '')) in
        ('candidate_attorney', 'candidate') then 'candidate_attorney'
      when lower(coalesce(member.workspace_role, member.organisation_role, member.role, '')) in
        ('conveyancing_secretary', 'secretary') then 'conveyancing_secretary'
      when lower(coalesce(member.workspace_role, member.organisation_role, member.role, '')) in
        ('admin_staff', 'administrator') then 'admin_staff'
      else 'attorney_conveyancer'
    end,
    case
      when lower(coalesce(member.workspace_role, member.organisation_role, member.role, '')) in
        ('owner', 'admin', 'firm_admin', 'principal', 'director', 'partner')
        then array['transfer', 'bond', 'cancellation']::text[]
      else array['transfer']::text[]
    end
  from public.organisation_users member
  where member.organisation_id = p_organisation_id
    and member.user_id is not null
    and lower(coalesce(member.status, 'active')) in ('active', 'accepted')
    and lower(coalesce(member.app_role, 'attorney')) = 'attorney'
  on conflict (firm_id, user_id) do update
  set
    status = case
      when public.attorney_firm_members.status = 'removed' then public.attorney_firm_members.status
      else 'active'
    end,
    organisation_user_id = coalesce(
      public.attorney_firm_members.organisation_user_id,
      excluded.organisation_user_id
    ),
    updated_at = now();

  update public.organisations
  set
    settings_json = coalesce(settings_json, '{}'::jsonb)
      || jsonb_build_object(
        'attorneyFirmId', v_firm.id::text,
        'attorney_firm_id', v_firm.id::text,
        'attorneyDirectoryReconciledAt', now()
      ),
    updated_at = now()
  where id = p_organisation_id;

  return v_firm.id;
end;
$$;

revoke all on function public.bridge_ensure_attorney_firm_for_workspace(uuid)
  from public, anon, authenticated;
grant execute on function public.bridge_ensure_attorney_firm_for_workspace(uuid)
  to service_role;

comment on function public.bridge_ensure_attorney_firm_for_workspace(uuid) is
  'Idempotently projects an active attorney organisation and its active workspace members into the canonical firm directory used by Matters routing.';

create or replace function public.bridge_resolve_attorney_firm_for_transaction(
  p_transaction_id uuid,
  p_attorney_firm_id uuid default null,
  p_partner_organisation_id uuid default null,
  p_partner_name text default null,
  p_partner_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_firm_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to resolve an attorney firm.' using errcode = '42501';
  end if;

  if p_transaction_id is null or not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'You do not have access to assign an attorney firm to this transaction.' using errcode = '42501';
  end if;

  if p_attorney_firm_id is not null then
    select firm.id into v_firm_id
    from public.attorney_firms firm
    where firm.id = p_attorney_firm_id and coalesce(firm.is_active, true)
    limit 1;
  end if;

  if v_firm_id is null and p_partner_organisation_id is not null then
    select firm.id into v_firm_id
    from public.attorney_firms firm
    where firm.organisation_id = p_partner_organisation_id and coalesce(firm.is_active, true)
    order by firm.updated_at desc nulls last, firm.id
    limit 1;
  end if;

  -- Repair legitimate legacy attorney workspaces inside the protected
  -- transaction assignment boundary, then retry the canonical lookup.
  if v_firm_id is null and p_partner_organisation_id is not null then
    begin
      v_firm_id := public.bridge_ensure_attorney_firm_for_workspace(p_partner_organisation_id);
    exception
      when sqlstate '22023' then v_firm_id := null;
    end;
  end if;

  if v_firm_id is null and nullif(lower(trim(coalesce(p_partner_email, ''))), '') is not null then
    select firm.id into v_firm_id
    from public.attorney_firms firm
    left join public.organisations organisation on organisation.id = firm.organisation_id
    where coalesce(firm.is_active, true)
      and lower(trim(p_partner_email)) in (
        lower(trim(coalesce(firm.email, ''))),
        lower(trim(coalesce(organisation.email, ''))),
        lower(trim(coalesce(organisation.company_email, ''))),
        lower(trim(coalesce(organisation.billing_email, '')))
      )
    order by firm.updated_at desc nulls last, firm.id
    limit 1;
  end if;

  if v_firm_id is null and nullif(lower(trim(coalesce(p_partner_name, ''))), '') is not null then
    select firm.id into v_firm_id
    from public.attorney_firms firm
    left join public.organisations organisation on organisation.id = firm.organisation_id
    where coalesce(firm.is_active, true)
      and lower(trim(p_partner_name)) in (
        lower(trim(coalesce(firm.name, ''))),
        lower(trim(coalesce(organisation.name, ''))),
        lower(trim(coalesce(organisation.display_name, ''))),
        lower(trim(coalesce(organisation.legal_name, '')))
      )
    order by firm.updated_at desc nulls last, firm.id
    limit 1;
  end if;

  if v_firm_id is null then
    raise exception 'The selected attorney firm is not linked to an active attorney workspace.' using errcode = '22023';
  end if;

  return v_firm_id;
end;
$$;

revoke all on function public.bridge_resolve_attorney_firm_for_transaction(uuid, uuid, uuid, text, text)
  from public, anon;
grant execute on function public.bridge_resolve_attorney_firm_for_transaction(uuid, uuid, uuid, text, text)
  to authenticated;

-- Reconcile existing active attorney workspaces once. This is idempotent and
-- deliberately does not overwrite established firm-specific member roles.
do $$
declare
  v_organisation_id uuid;
begin
  for v_organisation_id in
    select organisation.id
    from public.organisations organisation
    where lower(coalesce(organisation.status, 'active')) = 'active'
      and lower(coalesce(
        organisation.workspace_kind,
        organisation.settings_json ->> 'workspaceKind',
        organisation.settings_json ->> 'workspaceType',
        organisation.type,
        organisation.organization_type,
        ''
      )) in ('attorney_firm', 'attorney')
  loop
    perform public.bridge_ensure_attorney_firm_for_workspace(v_organisation_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
