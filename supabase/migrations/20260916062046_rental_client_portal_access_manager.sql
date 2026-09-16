begin;

-- Staff can inspect only the invitation metadata for properties or tenancies
-- within their branch. Token hashes and client auth identifiers are excluded.
create or replace function public.rental_client_portal_access_overview(p_organisation_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_invitations jsonb;
  v_memberships jsonb;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;

  select coalesce(jsonb_agg(row_data order by (row_data->>'created_at') desc), '[]'::jsonb) into v_invitations
  from (
    select jsonb_build_object(
      'id', invitation.id,
      'audience', invitation.audience,
      'email', invitation.email,
      'tenancy_id', invitation.tenancy_id,
      'property_id', invitation.property_id,
      'expires_at', invitation.expires_at,
      'accepted_at', invitation.accepted_at,
      'revoked_at', invitation.revoked_at,
      'created_at', invitation.created_at,
      'target_name', coalesce(property.name, 'Rental relationship')
    ) as row_data
    from public.rental_client_portal_invitations invitation
    left join public.rental_tenancies tenancy on tenancy.id = invitation.tenancy_id
    left join public.rental_properties property on property.id = coalesce(tenancy.property_id, invitation.property_id)
    where (p_organisation_id is null or invitation.organisation_id = p_organisation_id)
      and property.id is not null
      and public.rental_branch_access(property.organisation_id, property.branch_id)
  ) invitation_rows;

  select coalesce(jsonb_agg(row_data order by (row_data->>'created_at') desc), '[]'::jsonb) into v_memberships
  from (
    select jsonb_build_object(
      'id', membership.id,
      'audience', membership.audience,
      'tenancy_id', membership.tenancy_id,
      'property_id', membership.property_id,
      'status', membership.status,
      'created_at', membership.created_at,
      'revoked_at', membership.revoked_at,
      'target_name', coalesce(property.name, 'Rental relationship')
    ) as row_data
    from public.rental_client_portal_memberships membership
    left join public.rental_tenancies tenancy on tenancy.id = membership.tenancy_id
    left join public.rental_properties property on property.id = coalesce(tenancy.property_id, membership.property_id)
    where (p_organisation_id is null or membership.organisation_id = p_organisation_id)
      and property.id is not null
      and public.rental_branch_access(property.organisation_id, property.branch_id)
  ) membership_rows;

  return jsonb_build_object('invitations', v_invitations, 'memberships', v_memberships);
end;
$$;

create or replace function public.rental_client_portal_revoke_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_invitation public.rental_client_portal_invitations%rowtype;
  v_property_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  select * into v_invitation from public.rental_client_portal_invitations where id = p_invitation_id for update;
  if not found then raise exception 'Invitation not found'; end if;
  select coalesce(tenancy.property_id, v_invitation.property_id) into v_property_id from public.rental_tenancies tenancy where tenancy.id = v_invitation.tenancy_id;
  v_property_id := coalesce(v_property_id, v_invitation.property_id);
  if not exists (select 1 from public.rental_properties property where property.id = v_property_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then
    raise exception 'Not authorized';
  end if;
  update public.rental_client_portal_invitations set revoked_at = now() where id = v_invitation.id and accepted_at is null and revoked_at is null;
end;
$$;

revoke all on function public.rental_client_portal_access_overview(uuid) from public, anon;
revoke all on function public.rental_client_portal_revoke_invitation(uuid) from public, anon;
grant execute on function public.rental_client_portal_access_overview(uuid) to authenticated;
grant execute on function public.rental_client_portal_revoke_invitation(uuid) to authenticated;

commit;
