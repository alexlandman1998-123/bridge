begin;

create or replace function public.bridge_get_bond_partner_profile_overview(
  p_relationship_id uuid,
  p_current_organisation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationship public.organisation_partners%rowtype;
  v_current_organisation_id uuid := p_current_organisation_id;
  v_partner_organisation_id uuid;
  v_partner public.organisations%rowtype;
  v_branch_count integer := 0;
  v_linked_transaction_count integer := 0;
  v_linked_application_count integer := 0;
  v_relationship_status text;
begin
  if auth.uid() is null or p_relationship_id is null or v_current_organisation_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  if not public.bridge_is_active_member(v_current_organisation_id) then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select *
    into v_relationship
    from public.organisation_partners
   where id = p_relationship_id
     and (
       organisation_id = v_current_organisation_id
       or partner_organisation_id = v_current_organisation_id
     )
   limit 1;

  if not found then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  v_relationship_status := coalesce(
    nullif(v_relationship.relationship_status, ''),
    nullif(v_relationship.status, ''),
    'pending'
  );

  if v_relationship_status not in ('accepted', 'approved', 'connected') then
    return jsonb_build_object('error_code', 'not_accepted');
  end if;

  v_partner_organisation_id := case
    when v_relationship.organisation_id = v_current_organisation_id then v_relationship.partner_organisation_id
    else v_relationship.organisation_id
  end;

  select *
    into v_partner
    from public.organisations
   where id = v_partner_organisation_id
   limit 1;

  if not found then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select count(*)::integer
    into v_branch_count
    from public.organisation_branches
   where organisation_id = v_partner_organisation_id
     and coalesce(is_active, true) is true;

  select count(distinct t.id)::integer
    into v_linked_transaction_count
    from public.transactions t
   where t.partner_relationship_id = p_relationship_id
      or (
        t.organisation_id = v_current_organisation_id
        and (
          t.originating_partner_organisation_id = v_partner_organisation_id
          or t.referral_source_organisation_id = v_partner_organisation_id
        )
      );

  select count(distinct tba.id)::integer
    into v_linked_application_count
    from public.transaction_bond_applications tba
    join public.transactions t on t.id = tba.transaction_id
   where t.partner_relationship_id = p_relationship_id
      or (
        t.organisation_id = v_current_organisation_id
        and (
          t.originating_partner_organisation_id = v_partner_organisation_id
          or t.referral_source_organisation_id = v_partner_organisation_id
        )
      );

  return jsonb_build_object(
    'relationship', jsonb_build_object(
      'id', v_relationship.id,
      'status', v_relationship_status,
      'relationship_type', coalesce(nullif(v_relationship.relationship_type, ''), 'approved'),
      'connected_since', coalesce(v_relationship.accepted_at, v_relationship.created_at),
      'organisation_id', v_relationship.organisation_id,
      'partner_organisation_id', v_relationship.partner_organisation_id,
      'relationship_owner', null
    ),
    'partnerOrganisation', jsonb_build_object(
      'id', v_partner.id,
      'name', coalesce(nullif(v_partner.display_name, ''), nullif(v_partner.name, ''), 'Partner organisation'),
      'type', v_partner.type,
      'location', concat_ws(', ', nullif(v_partner.city, ''), nullif(v_partner.province, '')),
      'logo_url', v_partner.logo_url
    ),
    'summary', jsonb_build_object(
      'branch_count', coalesce(v_branch_count, 0),
      'linked_transaction_count', coalesce(v_linked_transaction_count, 0),
      'linked_application_count', coalesce(v_linked_application_count, 0),
      'relationship_health', 'Active'
    )
  );
end;
$$;

grant execute on function public.bridge_get_bond_partner_profile_overview(uuid, uuid) to authenticated;

commit;
