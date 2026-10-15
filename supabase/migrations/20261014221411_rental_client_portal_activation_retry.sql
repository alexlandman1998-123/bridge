begin;

-- Preserve the existing email-bound acceptance and membership creation command.
-- A retry only acknowledges a still-active membership created by this invitation.
alter function public.rental_client_portal_accept_invitation(text) set schema rental_private;
alter function rental_private.rental_client_portal_accept_invitation(text) rename to accept_client_invitation_before_retry;
revoke all on function rental_private.accept_client_invitation_before_retry(text) from public,anon,authenticated,service_role;

create function rental_private.accept_client_portal_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  invitation public.rental_client_portal_invitations%rowtype;
  membership public.rental_client_portal_memberships%rowtype;
  current_email text;
begin
  if auth.uid() is null or length(btrim(coalesce(p_token,'')))<24 then
    raise exception 'This invitation cannot be accepted.';
  end if;
  select lower(email) into current_email from auth.users where id=auth.uid();
  if current_email is null then raise exception 'This invitation cannot be accepted.'; end if;
  select * into invitation from public.rental_client_portal_invitations
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found or invitation.revoked_at is not null or invitation.expires_at<=now()
    or lower(invitation.email) is distinct from current_email then
    raise exception 'This invitation is invalid, expired, or addressed to a different email address.';
  end if;
  if invitation.accepted_at is null then
    return rental_private.accept_client_invitation_before_retry(p_token)||jsonb_build_object('idempotent',false);
  end if;
  if invitation.accepted_by is distinct from auth.uid() then
    raise exception 'This invitation is invalid, expired, or addressed to a different email address.';
  end if;
  select * into membership from public.rental_client_portal_memberships
    where invitation_id=invitation.id and user_id=auth.uid() and status='active' and revoked_at is null
      and organisation_id=invitation.organisation_id and audience=invitation.audience
      and tenancy_id is not distinct from invitation.tenancy_id
      and property_id is not distinct from invitation.property_id
    for share;
  if not found then raise exception 'This invitation no longer has active access. Ask your rental team for a new invitation.'; end if;
  return jsonb_build_object('membership_id',membership.id,'audience',membership.audience,'idempotent',true);
end;
$$;
revoke all on function rental_private.accept_client_portal_invitation(text) from public,anon,service_role;
grant usage on schema rental_private to authenticated;
grant execute on function rental_private.accept_client_portal_invitation(text) to authenticated;

create function public.rental_client_portal_accept_invitation(p_token text)
returns jsonb language sql security invoker set search_path='' as $$
  select rental_private.accept_client_portal_invitation(p_token)
$$;
revoke all on function public.rental_client_portal_accept_invitation(text) from public,anon,service_role;
grant execute on function public.rental_client_portal_accept_invitation(text) to authenticated;
commit;
