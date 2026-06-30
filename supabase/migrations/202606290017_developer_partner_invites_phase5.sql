begin;

create extension if not exists "pgcrypto";

alter table public.developer_partner_relationships
  add column if not exists invitation_token_hash text,
  add column if not exists invitation_expires_at timestamptz,
  add column if not exists invitation_sent_at timestamptz,
  add column if not exists invitation_email_status text,
  add column if not exists invitation_email_error text;

create unique index if not exists developer_partner_relationships_invitation_token_hash_idx
  on public.developer_partner_relationships (invitation_token_hash)
  where invitation_token_hash is not null;

create or replace function public.bridge_prepare_developer_partner_invitation(target_relationship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationship public.developer_partner_relationships%rowtype;
  v_token text;
  v_hash text;
  v_expires_at timestamptz := now() + interval '30 days';
begin
  if target_relationship_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_relationship');
  end if;

  select *
    into v_relationship
  from public.developer_partner_relationships
  where id = target_relationship_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'relationship_not_found');
  end if;

  if not public.bridge_is_org_admin(v_relationship.developer_organisation_id) then
    raise exception 'permission denied'
      using errcode = '42501';
  end if;

  if v_relationship.status in ('archived', 'suspended') then
    return jsonb_build_object('ok', false, 'reason', 'relationship_unavailable');
  end if;

  v_token := 'devp_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  update public.developer_partner_relationships
     set invitation_token_hash = v_hash,
         invitation_expires_at = v_expires_at,
         invitation_sent_at = now(),
         invitation_email_status = 'link_created',
         invitation_email_error = null
   where id = v_relationship.id;

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'relationshipId', v_relationship.id,
    'expiresAt', v_expires_at
  );
end;
$$;

create or replace function public.bridge_get_developer_partner_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_hash text;
  v_relationship public.developer_partner_relationships%rowtype;
  v_developer public.organisations%rowtype;
  v_partner public.organisations%rowtype;
begin
  if v_token is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_token');
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

  select *
    into v_developer
  from public.organisations
  where id = v_relationship.developer_organisation_id;

  if v_relationship.partner_organisation_id is not null then
    select *
      into v_partner
    from public.organisations
    where id = v_relationship.partner_organisation_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'relationship', jsonb_build_object(
      'id', v_relationship.id,
      'partnerType', v_relationship.partner_type,
      'status', v_relationship.status,
      'scopeType', v_relationship.scope_type,
      'scopeJson', v_relationship.scope_json,
      'partnerDisplayName', v_relationship.partner_display_name,
      'partnerInvitationEmail', v_relationship.partner_invitation_email,
      'invitedAt', v_relationship.invited_at,
      'expiresAt', v_relationship.invitation_expires_at
    ),
    'developer', jsonb_build_object(
      'id', v_developer.id,
      'name', coalesce(v_developer.display_name, v_developer.name, 'Developer')
    ),
    'partner', case
      when v_relationship.partner_organisation_id is null then null
      else jsonb_build_object(
        'id', v_partner.id,
        'name', coalesce(v_partner.display_name, v_partner.name, v_relationship.partner_display_name, 'Partner')
      )
    end
  );
end;
$$;

create or replace function public.bridge_accept_developer_partner_invitation(
  p_token text,
  p_partner_display_name text default null,
  p_partner_email text default null
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
begin
  if v_token is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_token');
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

  update public.developer_partner_relationships
     set status = case
           when status = 'agreement_active' then status
           else 'accepted'
         end,
         accepted_at = coalesce(accepted_at, now()),
         partner_display_name = coalesce(nullif(trim(p_partner_display_name), ''), partner_display_name),
         partner_invitation_email = coalesce(nullif(lower(trim(p_partner_email)), ''), partner_invitation_email),
         invitation_token_hash = null,
         invitation_email_status = 'accepted'
   where id = v_relationship.id;

  return jsonb_build_object(
    'ok', true,
    'relationshipId', v_relationship.id
  );
end;
$$;

grant execute on function public.bridge_prepare_developer_partner_invitation(uuid) to authenticated;
grant execute on function public.bridge_get_developer_partner_invitation(text) to anon, authenticated;
grant execute on function public.bridge_accept_developer_partner_invitation(text, text, text) to anon, authenticated;

commit;
