begin;

drop function if exists public.bridge_accept_developer_partner_invitation(text, text, text);

create or replace function public.bridge_accept_developer_partner_invitation(
  p_token text,
  p_partner_display_name text default null,
  p_partner_email text default null,
  p_partner_organisation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_hash text;
  v_relationship public.developer_partner_relationships%rowtype;
  v_partner_organisation_id uuid := p_partner_organisation_id;
  v_partner_organisation public.organisations%rowtype;
begin
  if v_token is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_token');
  end if;

  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'authentication_required');
  end if;

  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  select *
    into v_relationship
  from public.developer_partner_relationships
  where invitation_token_hash = v_hash;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

  if v_relationship.invitation_expires_at is not null and v_relationship.invitation_expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'invite_expired', 'expiresAt', v_relationship.invitation_expires_at);
  end if;

  if v_relationship.status in ('archived', 'suspended') then
    return jsonb_build_object('ok', false, 'reason', 'relationship_unavailable');
  end if;

  v_partner_organisation_id := coalesce(v_partner_organisation_id, v_relationship.partner_organisation_id);

  if v_partner_organisation_id is null then
    return jsonb_build_object('ok', false, 'reason', 'organisation_required');
  end if;

  if v_partner_organisation_id = v_relationship.developer_organisation_id then
    return jsonb_build_object('ok', false, 'reason', 'self_relationship');
  end if;

  if v_relationship.partner_organisation_id is not null and v_relationship.partner_organisation_id <> v_partner_organisation_id then
    return jsonb_build_object('ok', false, 'reason', 'wrong_workspace');
  end if;

  if not public.bridge_is_org_admin(v_partner_organisation_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_workspace_admin');
  end if;

  select *
    into v_partner_organisation
  from public.organisations
  where id = v_partner_organisation_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'organisation_required');
  end if;

  update public.developer_partner_relationships
     set status = case
           when status = 'agreement_active' then status
           else 'accepted'
         end,
         partner_organisation_id = v_partner_organisation_id,
         accepted_by = coalesce(accepted_by, auth.uid()),
         accepted_at = coalesce(accepted_at, now()),
         partner_display_name = coalesce(
           nullif(trim(p_partner_display_name), ''),
           partner_display_name,
           v_partner_organisation.display_name,
           v_partner_organisation.name
         ),
         partner_invitation_email = coalesce(nullif(lower(trim(p_partner_email)), ''), partner_invitation_email),
         metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
           'acceptedVia', 'developer_partner_invite',
           'acceptedOrganisationId', v_partner_organisation_id,
           'acceptedBy', auth.uid(),
           'acceptedAt', now()
         ),
         invitation_token_hash = null,
         invitation_email_status = 'accepted',
         invitation_email_error = null
   where id = v_relationship.id;

  return jsonb_build_object(
    'ok', true,
    'relationshipId', v_relationship.id,
    'partnerOrganisationId', v_partner_organisation_id,
    'redirectTo', '/dashboard'
  );
end;
$$;

grant execute on function public.bridge_accept_developer_partner_invitation(text, text, text, uuid) to authenticated;

commit;
