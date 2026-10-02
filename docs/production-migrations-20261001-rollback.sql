-- Recovery only: restores the prior, broader onboarding access model. Review before use.
-- No user records are deleted. Migration ledger rollback is a separate reviewed operation.
begin;
set local lock_timeout = '5s';
update storage.buckets set file_size_limit=26214400 where id='documents';
drop policy if exists private_listing_seller_onboarding_member_access on public.private_listing_seller_onboarding;
create policy "private_listing_seller_onboarding_mutate_member" on public.private_listing_seller_onboarding for ALL to "authenticated" using (true) with check (true);
create policy "private_listing_seller_onboarding_select_member" on public.private_listing_seller_onboarding for SELECT to "authenticated" using (true);
create policy "private_listing_seller_onboarding_select_token" on public.private_listing_seller_onboarding for SELECT to "anon" using (((token IS NOT NULL) AND ((token_expires_at IS NULL) OR (token_expires_at > now()))));
create policy "private_listing_seller_onboarding_update_token" on public.private_listing_seller_onboarding for UPDATE to "anon" using (((token IS NOT NULL) AND ((token_expires_at IS NULL) OR (token_expires_at > now())))) with check (((token IS NOT NULL) AND ((token_expires_at IS NULL) OR (token_expires_at > now()))));
grant all on public.private_listing_seller_onboarding to anon, authenticated;
drop function if exists public.bridge_get_private_listing_seller_onboarding_form(text);
CREATE OR REPLACE FUNCTION public.bridge_resolve_private_listing_seller_portal_token(p_token text)
 RETURNS TABLE(onboarding_id uuid, legacy_token text, stable_portal_token text, token_kind text, token_valid boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with input as (
    select nullif(trim(coalesce(p_token, '')), '') as token,
      case when nullif(trim(coalesce(p_token, '')), '') is null then null
        else encode(digest(trim(p_token), 'sha256'), 'hex') end as token_hash
  ), candidates as (
    select onboarding.id as onboarding_id, onboarding.token as legacy_token,
      onboarding.seller_portal_token as stable_portal_token,
      case when onboarding.seller_portal_token = input.token then 'stable'
        when onboarding.token = input.token then 'legacy' else 'invite' end as token_kind,
      case when onboarding.seller_portal_token = input.token then true
        when onboarding.token = input.token then true
        else onboarding.seller_portal_invite_consumed_at is null
          and onboarding.seller_portal_invite_expires_at is not null
          and onboarding.seller_portal_invite_expires_at > now() end as token_valid,
      1 as priority
    from input join public.private_listing_seller_onboarding onboarding
      on onboarding.seller_portal_token = input.token
      or onboarding.token = input.token
      or onboarding.seller_portal_invite_token_hash = input.token_hash
    union all
    select onboarding.id, onboarding.token, onboarding.seller_portal_token,
      'recipient_invite',
      recipient.consumed_at is null and recipient.expires_at > now()
        and recipient.status not in ('revoked', 'expired'),
      2
    from input
    join public.private_listing_seller_portal_recipient_invites recipient
      on recipient.invite_token_hash = input.token_hash
    join public.private_listing_seller_onboarding onboarding
      on onboarding.id = recipient.seller_onboarding_id
  )
  select onboarding_id, legacy_token, stable_portal_token, token_kind, token_valid
  from candidates
  order by priority
  limit 1;
$function$
;
revoke all on function public.bridge_resolve_private_listing_seller_portal_token(text) from public, anon, authenticated, service_role;
grant execute on function public.bridge_resolve_private_listing_seller_portal_token(text) to "postgres";
CREATE OR REPLACE FUNCTION public.bridge_update_private_listing_seller_onboarding_progress(p_token text, p_status text DEFAULT 'in_progress'::text, p_form_data jsonb DEFAULT '{}'::jsonb, p_seller_type text DEFAULT NULL::text, p_ownership_structure text DEFAULT NULL::text, p_marital_regime text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_status text := coalesce(nullif(trim(lower(p_status)), ''), 'in_progress');
  v_form_data jsonb := coalesce(p_form_data, '{}'::jsonb);
begin
  if v_status not in ('not_started', 'sent', 'in_progress', 'completed', 'rejected') then
    v_status := 'in_progress';
  end if;

  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
    and (token_expires_at is null or token_expires_at > now())
  limit 1;

  if not found then
    return null;
  end if;

  update public.private_listing_seller_onboarding
     set status = v_status,
         form_data = coalesce(form_data, '{}'::jsonb) || v_form_data,
         seller_type = coalesce(nullif(trim(p_seller_type), ''), seller_type),
         ownership_structure = coalesce(nullif(trim(p_ownership_structure), ''), ownership_structure),
         marital_regime = coalesce(nullif(trim(p_marital_regime), ''), marital_regime),
         updated_at = now()
   where id = v_onboarding.id
   returning * into v_onboarding;

  update public.private_listings
     set listing_status = case
           when v_status in ('sent', 'in_progress') and listing_status = 'seller_lead' then 'onboarding_sent'
           else listing_status
         end,
         seller_onboarding_status = case
           when v_status in ('sent', 'in_progress') then v_status
           else seller_onboarding_status
         end,
         updated_at = case
           when v_status in ('sent', 'in_progress') then now()
           else updated_at
         end
   where id = v_onboarding.private_listing_id
   returning * into v_listing;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash' - 'seller_portal_invite_token_hash',
    'transaction', 'null'::jsonb,
    'requirements', '[]'::jsonb,
    'documents', '[]'::jsonb,
    'appointments', '[]'::jsonb,
    'mandatePacket', 'null'::jsonb,
    'corePayload', true,
    'portalAccess', jsonb_build_object(
      'passwordSet', v_onboarding.seller_portal_password_hash is not null,
      'accessGranted', true,
      'expiresAt', v_onboarding.seller_portal_access_token_expires_at,
      'portalLinkExpiresAt', v_onboarding.seller_portal_link_expires_at
    )
  );
end;
$function$
;
revoke all on function public.bridge_update_private_listing_seller_onboarding_progress(text,text,jsonb,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.bridge_update_private_listing_seller_onboarding_progress(text,text,jsonb,text,text,text) to public;
grant execute on function public.bridge_update_private_listing_seller_onboarding_progress(text,text,jsonb,text,text,text) to "postgres";
grant execute on function public.bridge_update_private_listing_seller_onboarding_progress(text,text,jsonb,text,text,text) to "anon";
grant execute on function public.bridge_update_private_listing_seller_onboarding_progress(text,text,jsonb,text,text,text) to "authenticated";
grant execute on function public.bridge_update_private_listing_seller_onboarding_progress(text,text,jsonb,text,text,text) to "service_role";
notify pgrst, 'reload schema';
commit;
