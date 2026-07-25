begin;

create or replace function public.bridge_save_organisation_partner(
  p_organisation_id uuid,
  p_partner_role_configuration_id uuid default null,
  p_external_partner_id uuid default null,
  p_partner_organisation_id uuid default null,
  p_role_type text default 'transfer_attorney',
  p_company_name text default null,
  p_contact_person text default null,
  p_email_address text default null,
  p_phone_number text default null,
  p_website text default null,
  p_physical_address text default null,
  p_province text default null,
  p_notes text default null,
  p_is_active boolean default true,
  p_is_preferred_default boolean default false,
  p_source text default 'manual',
  p_scope_type text default 'all_developments',
  p_scope_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity_result jsonb;
  v_role_result jsonb;
  v_external_partner_id uuid;
  v_relationship_id uuid;
  v_resolved_role_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.bridge_phase3_can_manage_organization(p_organisation_id) then
    raise exception 'You cannot manage partners for this organisation.' using errcode = '42501';
  end if;

  v_identity_result := public.bridge_upsert_organisation_partner_identity(
    p_organisation_id,
    p_external_partner_id,
    public.bridge_normalize_partner_role_type(p_role_type),
    p_partner_organisation_id,
    p_company_name,
    p_contact_person,
    p_email_address,
    p_phone_number,
    p_website,
    p_physical_address,
    p_province,
    p_notes,
    p_is_active,
    p_is_preferred_default,
    p_source,
    p_scope_type,
    p_scope_json
  );
  v_external_partner_id := nullif(v_identity_result #>> '{partner,id}', '')::uuid;

  select role_config.id, role_config.relationship_id
  into v_resolved_role_id, v_relationship_id
  from public.organisation_partner_roles role_config
  where role_config.organisation_id = p_organisation_id
    and role_config.external_partner_id = v_external_partner_id
    and role_config.role_type = public.bridge_normalize_partner_role_type(p_role_type)
  limit 1;

  v_role_result := public.bridge_upsert_organisation_partner_role(
    p_organisation_id,
    coalesce(v_resolved_role_id, p_partner_role_configuration_id),
    v_relationship_id,
    v_external_partner_id,
    p_role_type,
    p_is_active,
    p_is_preferred_default,
    p_source,
    p_scope_type,
    p_scope_json
  );

  return jsonb_build_object(
    'success', true,
    'partner', (v_identity_result -> 'partner') || jsonb_build_object(
      'partner_role_configuration_id', v_role_result #>> '{role,id}',
      'partnerRoleConfigurationId', v_role_result #>> '{role,id}',
      'relationship_id', v_role_result #>> '{role,relationship_id}'
    ),
    'role', v_role_result -> 'role',
    'storage', 'organisation_partner_roles'
  );
end;
$$;

create or replace function public.bridge_remove_organisation_partner(
  p_organisation_id uuid,
  p_partner_role_configuration_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.organisation_partner_roles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.bridge_phase3_can_manage_organization(p_organisation_id) then
    raise exception 'You cannot manage partners for this organisation.' using errcode = '42501';
  end if;

  select * into v_role
  from public.organisation_partner_roles
  where id = p_partner_role_configuration_id
    and organisation_id = p_organisation_id
  for update;
  if v_role.id is null then
    raise exception 'Partner role configuration was not found.' using errcode = 'P0002';
  end if;

  update public.organisation_partner_roles
  set is_active = false,
      is_preferred_default = false,
      metadata = metadata || jsonb_build_object(
        'retiredAt', now(),
        'retiredBy', auth.uid(),
        'retirementMode', 'phase7_soft_remove'
      ),
      updated_at = now()
  where id = v_role.id
  returning * into v_role;

  if v_role.external_partner_id is not null then
    update public.organisation_preferred_partners
    set is_active = false,
        is_preferred_default = false,
        updated_at = now()
    where id = v_role.external_partner_id;
  end if;

  return jsonb_build_object('success', true, 'role', to_jsonb(v_role));
end;
$$;

create or replace function public.bridge_list_partner_connections_canonical(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_connection jsonb;
  v_configs jsonb;
  v_connections jsonb := '[]'::jsonb;
begin
  v_result := public.bridge_phase4_list_partner_connections(p_organisation_id);
  if coalesce((v_result ->> 'success')::boolean, false) is false then return v_result; end if;

  for v_connection in
    select value from jsonb_array_elements(coalesce(v_result -> 'connections', '[]'::jsonb))
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', role_config.id,
      'roleType', role_config.role_type,
      'isDefault', role_config.is_preferred_default,
      'scopeType', role_config.scope_type,
      'scope', role_config.scope_json
    ) order by role_config.role_type), '[]'::jsonb)
    into v_configs
    from public.organisation_partner_roles role_config
    where role_config.organisation_id = p_organisation_id
      and role_config.relationship_id = nullif(v_connection ->> 'relationship_id', '')::uuid
      and role_config.is_active;

    v_connections := v_connections || jsonb_build_array(
      jsonb_set(v_connection, '{roleConfigurations}', v_configs, true)
    );
  end loop;

  return jsonb_set(v_result, '{connections}', v_connections, true)
    || jsonb_build_object(
      'storage', 'organisation_partners',
      'assignmentIdentitySource', 'organisation_partner_roles.id',
      'legacyFallback', false
    );
end;
$$;

grant execute on function public.bridge_save_organisation_partner(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, jsonb
) to authenticated;
grant execute on function public.bridge_remove_organisation_partner(uuid, uuid) to authenticated;
grant execute on function public.bridge_list_partner_connections_canonical(uuid) to authenticated;

revoke insert, update, delete on public.organisation_preferred_partners from public, anon, authenticated;
revoke insert, update, delete on public.developer_partner_relationships from public, anon, authenticated;
revoke insert, update, delete on public.developer_partner_agreements from public, anon, authenticated;
revoke insert, update, delete on public.developer_partner_agreement_terms from public, anon, authenticated;
revoke insert, update, delete on public.partner_connections from public, anon, authenticated;

revoke execute on function public.bridge_upsert_organisation_partner_identity(
  uuid, uuid, text, uuid, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, jsonb
) from public, anon, authenticated;
revoke execute on function public.bridge_allocate_private_listing_transfer_attorney(
  uuid, uuid, text, text, text, text, uuid, text, uuid, timestamptz, jsonb
) from public, anon, authenticated;
revoke execute on function public.bridge_list_organisation_partner_directory_phase1_legacy(uuid)
  from public, anon, authenticated;
revoke execute on function public.bridge_list_organisation_partner_directory_phase5_legacy(uuid)
  from public, anon, authenticated;
revoke execute on function public.bridge_phase4_list_partner_connections(uuid)
  from public, anon, authenticated;

comment on table public.partner_connections is
  'Retired in partner model Phase 7. Read-only historical storage; canonical relationships live in organisation_partners.';
comment on table public.developer_partner_relationships is
  'Retired authenticated write path in partner model Phase 7. New relationships use organisation_partners and partner invitations.';
comment on table public.organisation_preferred_partners is
  'Compatibility contact-identity storage. Authenticated writes must use bridge_save_organisation_partner.';

notify pgrst, 'reload schema';

commit;
