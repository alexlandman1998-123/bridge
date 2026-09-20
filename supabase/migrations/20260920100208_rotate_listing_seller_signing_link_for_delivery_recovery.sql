-- Phase 3: an email retry must never require storing or recovering a raw signing
-- token. Rotate the active session's opaque token instead, invalidate the prior
-- URL, and leave an internal audit event. Only the server-side Edge Function may
-- call this bridge.
create or replace function public.bridge_rotate_listing_seller_signing_link(
  p_session_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_initiated_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.private_listing_mandate_signing_sessions%rowtype;
begin
  if nullif(trim(coalesce(p_token_hash, '')), '') is null then
    raise exception 'A secure signing token is required.';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'The replacement signing link must expire in the future.';
  end if;

  select * into v_session
  from public.private_listing_mandate_signing_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Seller signing session not found.';
  end if;
  if v_session.status <> 'active' then
    raise exception 'Only an active seller signing link can be replaced.';
  end if;

  update public.private_listing_mandate_signing_sessions
     set token_hash = trim(p_token_hash),
         expires_at = p_expires_at,
         viewed_at = null,
         updated_at = now()
   where id = v_session.id;

  insert into public.private_listing_activity (
    private_listing_id, activity_type, activity_title, activity_description,
    visibility, metadata
  ) values (
    v_session.private_listing_id,
    'seller_signing_link_reissued',
    'Seller signing link reissued',
    'A fresh secure seller signing link was created. The previous link no longer works.',
    'internal',
    jsonb_build_object(
      'signingSessionId', v_session.id,
      'signingGroupId', v_session.signing_group_id,
      'signerEmail', v_session.signer_email,
      'expiresAt', p_expires_at,
      'initiatedBy', p_initiated_by
    )
  );

  return jsonb_build_object(
    'sessionId', v_session.id,
    'signerName', v_session.signer_name,
    'signerEmail', v_session.signer_email,
    'expiresAt', p_expires_at
  );
end;
$$;

revoke all on function public.bridge_rotate_listing_seller_signing_link(uuid, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.bridge_rotate_listing_seller_signing_link(uuid, text, timestamptz, uuid) to service_role;
