begin;

create or replace function public.bridge_resolve_seller_connected_transfer_attorney(
  p_organisation_id uuid,
  p_partner_organisation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_partner_organisation public.organisations%rowtype;
  v_preferred_partner public.organisation_preferred_partners%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_organisation_id is null or p_partner_organisation_id is null then
    raise exception 'The agency and connected attorney organisation are required.' using errcode = '22023';
  end if;

  if not public.bridge_is_active_member(p_organisation_id) then
    raise exception 'You are not an active member of this agency.' using errcode = '42501';
  end if;

  select organisation.*
  into v_partner_organisation
  from public.organisations organisation
  where organisation.id = p_partner_organisation_id
    and lower(coalesce(organisation.type, '')) = 'attorney_firm';

  if v_partner_organisation.id is null then
    raise exception 'The selected organisation is not an attorney firm.' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.organisation_partners relationship
    where (
      (relationship.organisation_id = p_organisation_id and relationship.partner_organisation_id = p_partner_organisation_id)
      or
      (relationship.organisation_id = p_partner_organisation_id and relationship.partner_organisation_id = p_organisation_id)
    )
      and lower(coalesce(relationship.status, relationship.relationship_status, '')) = 'accepted'
  ) then
    raise exception 'The selected attorney is not connected to this agency.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text || ':' || p_partner_organisation_id::text));

  select preferred_partner.*
  into v_preferred_partner
  from public.organisation_preferred_partners preferred_partner
  where preferred_partner.organisation_id = p_organisation_id
    and preferred_partner.partner_type = 'transfer_attorney'
    and preferred_partner.partner_organisation_id = p_partner_organisation_id
  order by preferred_partner.is_active desc, preferred_partner.created_at asc
  limit 1
  for update;

  if v_preferred_partner.id is null then
    insert into public.organisation_preferred_partners (
      organisation_id,
      partner_type,
      partner_organisation_id,
      source,
      scope_type,
      scope_json,
      company_name,
      is_active,
      is_preferred_default
    ) values (
      p_organisation_id,
      'transfer_attorney',
      p_partner_organisation_id,
      'manual',
      'all_developments',
      '{}'::jsonb,
      coalesce(nullif(trim(v_partner_organisation.display_name), ''), nullif(trim(v_partner_organisation.name), ''), 'Connected attorney'),
      true,
      false
    )
    returning * into v_preferred_partner;
  else
    update public.organisation_preferred_partners
    set company_name = coalesce(nullif(trim(v_partner_organisation.display_name), ''), nullif(trim(v_partner_organisation.name), ''), v_preferred_partner.company_name),
        partner_organisation_id = p_partner_organisation_id,
        is_active = true,
        updated_at = now()
    where id = v_preferred_partner.id
    returning * into v_preferred_partner;
  end if;

  return to_jsonb(v_preferred_partner);
end;
$$;

revoke all on function public.bridge_resolve_seller_connected_transfer_attorney(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.bridge_resolve_seller_connected_transfer_attorney(uuid, uuid)
  to authenticated;

comment on function public.bridge_resolve_seller_connected_transfer_attorney(uuid, uuid)
  is 'Validates an accepted attorney connection and creates or reuses the internal transfer-attorney record required by seller onboarding.';

commit;
