begin;

create extension if not exists pgcrypto with schema extensions;

alter table if exists public.private_listing_seller_onboarding
  add column if not exists seller_portal_activation_source text,
  add column if not exists seller_portal_status text not null default 'not_activated',
  add column if not exists seller_portal_invitation_created_by uuid references auth.users(id) on delete set null,
  add column if not exists seller_portal_invitation_sent_at timestamptz,
  add column if not exists seller_portal_invitation_last_sent_at timestamptz,
  add column if not exists seller_portal_invitation_cancelled_at timestamptz,
  add column if not exists seller_portal_activated_at timestamptz,
  add column if not exists seller_portal_terms_accepted_at timestamptz,
  add column if not exists seller_portal_terms_version text,
  add column if not exists seller_portal_terms_acceptance_id uuid;

do $$
begin
  alter table public.private_listing_seller_onboarding
    add constraint private_listing_seller_onboarding_activation_source_check
    check (
      seller_portal_activation_source is null
      or seller_portal_activation_source in ('seller_lead', 'existing_listing', 'manual_listing', 'bulk_import', 'agent_invitation')
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.private_listing_seller_onboarding
    add constraint private_listing_seller_onboarding_portal_status_check
    check (seller_portal_status in (
      'not_activated',
      'invitation_pending',
      'invitation_sent',
      'activated',
      'profile_incomplete',
      'profile_complete',
      'transaction_ready',
      'invitation_expired',
      'invitation_cancelled'
    ));
exception
  when duplicate_object then null;
end $$;

create table if not exists public.seller_portal_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  seller_onboarding_id uuid not null references public.private_listing_seller_onboarding(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  activation_source text not null,
  terms_type text not null default 'seller_portal_activation',
  terms_version text not null,
  privacy_policy_version text,
  fee_disclosure_version text,
  fee_amount numeric(12,2),
  currency text not null default 'ZAR',
  wording_snapshot text not null,
  checkbox_label text not null,
  accepted_at timestamptz not null default now(),
  accepted_by_email text,
  token_hash text,
  ip_address inet,
  user_agent text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint seller_portal_terms_acceptances_source_check
    check (activation_source in ('seller_lead', 'existing_listing', 'manual_listing', 'bulk_import', 'agent_invitation')),
  constraint seller_portal_terms_acceptances_terms_type_check
    check (terms_type in ('seller_portal_activation')),
  constraint seller_portal_terms_acceptances_metadata_object_check
    check (jsonb_typeof(metadata_json) = 'object')
);

create index if not exists seller_portal_terms_acceptances_listing_idx
  on public.seller_portal_terms_acceptances (private_listing_id, accepted_at desc);

create index if not exists seller_portal_terms_acceptances_onboarding_idx
  on public.seller_portal_terms_acceptances (seller_onboarding_id, accepted_at desc);

create unique index if not exists seller_portal_terms_acceptances_one_activation_idx
  on public.seller_portal_terms_acceptances (seller_onboarding_id, terms_type, terms_version);

do $$
begin
  alter table public.private_listing_seller_onboarding
    add constraint private_listing_seller_onboarding_terms_acceptance_fk
    foreign key (seller_portal_terms_acceptance_id)
    references public.seller_portal_terms_acceptances(id)
    on delete set null
    deferrable initially deferred;
exception
  when duplicate_object then null;
end $$;

alter table public.seller_portal_terms_acceptances enable row level security;

drop policy if exists seller_portal_terms_acceptances_internal_select on public.seller_portal_terms_acceptances;
create policy seller_portal_terms_acceptances_internal_select
  on public.seller_portal_terms_acceptances
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.private_listings listing
      where listing.id = seller_portal_terms_acceptances.private_listing_id
        and public.bridge_is_active_member(listing.organisation_id)
    )
  );

grant select on public.seller_portal_terms_acceptances to authenticated;

create or replace function public.bridge_record_seller_portal_activation_terms(
  p_token text,
  p_acceptance jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_wording public.transaction_consent_wording_versions%rowtype;
  v_headers jsonb := public.bridge_request_headers();
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_token_hash text := case when v_token is null then null else encode(digest(v_token, 'sha256'), 'hex') end;
  v_accepted boolean := lower(trim(coalesce(p_acceptance ->> 'accepted', p_acceptance ->> 'platformFeeAccepted', p_acceptance ->> 'platform_fee_accepted', 'false'))) in ('true', 't', 'yes', '1');
  v_terms_version text := nullif(trim(coalesce(p_acceptance ->> 'wordingVersion', p_acceptance ->> 'wording_version', '')), '');
  v_fee_amount numeric;
  v_currency text := coalesce(upper(nullif(trim(coalesce(p_acceptance ->> 'currency', 'ZAR')), '')), 'ZAR');
  v_accepted_at timestamptz;
  v_ip inet;
  v_acceptance public.seller_portal_terms_acceptances%rowtype;
begin
  if not v_accepted then
    raise exception 'Seller Portal Terms and fee disclosure must be accepted before activation.' using errcode = '22023';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(v_token);

  if not found or not v_resolution.token_valid then
    raise exception 'Seller portal invitation is invalid, expired, or already used.' using errcode = '42501';
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id
  for update;

  select * into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id;

  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    raise exception 'Seller portal link is invalid or inactive.' using errcode = '42501';
  end if;

  select * into v_wording
  from public.transaction_consent_wording_versions wording
  where wording.consent_type = 'arch9_transaction_platform_fee'
    and wording.party_type = 'seller'
    and wording.status = 'published'
  order by wording.effective_at desc, wording.created_at desc
  limit 1;

  if not found then
    raise exception 'Published seller platform fee wording is not configured.' using errcode = 'P0002';
  end if;

  begin
    v_fee_amount := nullif(trim(coalesce(p_acceptance ->> 'feeAmount', p_acceptance ->> 'fee_amount', '')), '')::numeric;
  exception when others then
    raise exception 'Platform fee amount must be valid.' using errcode = '22023';
  end;

  if v_terms_version is distinct from v_wording.wording_version then
    raise exception 'Seller Portal Terms version is no longer current. Please reload and accept the latest wording.' using errcode = '22023';
  end if;

  if coalesce(v_fee_amount, -1) <> v_wording.fee_amount or v_currency <> v_wording.currency then
    raise exception 'Seller Portal fee disclosure does not match the published wording.' using errcode = '22023';
  end if;

  begin
    v_accepted_at := coalesce(nullif(trim(coalesce(p_acceptance ->> 'acceptedAt', p_acceptance ->> 'accepted_at', '')), '')::timestamptz, now());
  exception when others then
    raise exception 'Terms accepted time must be valid.' using errcode = '22023';
  end;

  begin
    v_ip := nullif(trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1)), '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.seller_portal_terms_acceptances (
    organisation_id,
    private_listing_id,
    seller_onboarding_id,
    user_id,
    activation_source,
    terms_version,
    privacy_policy_version,
    fee_disclosure_version,
    fee_amount,
    currency,
    wording_snapshot,
    checkbox_label,
    accepted_at,
    accepted_by_email,
    token_hash,
    ip_address,
    user_agent,
    metadata_json
  )
  values (
    v_listing.organisation_id,
    v_listing.id,
    v_onboarding.id,
    auth.uid(),
    coalesce(v_onboarding.seller_portal_activation_source, 'existing_listing'),
    v_wording.wording_version,
    nullif(trim(coalesce(p_acceptance ->> 'privacyPolicyVersion', p_acceptance ->> 'privacy_policy_version', '')), ''),
    v_wording.wording_version,
    v_wording.fee_amount,
    v_wording.currency,
    coalesce(nullif(trim(coalesce(p_acceptance ->> 'wordingSnapshot', p_acceptance ->> 'wording_snapshot', '')), ''), v_wording.body),
    v_wording.checkbox_label,
    v_accepted_at,
    nullif(left(lower(trim(coalesce(p_acceptance ->> 'acceptedByEmail', p_acceptance ->> 'accepted_by_email', ''))), 320), ''),
    v_token_hash,
    v_ip,
    nullif(left(trim(coalesce(v_headers ->> 'user-agent', '')), 1000), ''),
    jsonb_build_object(
      'sourcePayload', p_acceptance,
      'tokenKind', v_resolution.token_kind,
      'stablePortalTokenPresent', v_resolution.stable_portal_token is not null
    )
  )
  on conflict (seller_onboarding_id, terms_type, terms_version) do nothing
  returning * into v_acceptance;

  if not found then
    select * into v_acceptance
    from public.seller_portal_terms_acceptances
    where seller_onboarding_id = v_onboarding.id
      and terms_type = 'seller_portal_activation'
      and terms_version = v_wording.wording_version;
  end if;

  update public.private_listing_seller_onboarding
  set seller_portal_status = case
        when status in ('completed', 'submitted', 'approved') then 'profile_complete'
        else 'activated'
      end,
      seller_portal_activated_at = coalesce(seller_portal_activated_at, now()),
      seller_portal_terms_accepted_at = coalesce(seller_portal_terms_accepted_at, v_acceptance.accepted_at),
      seller_portal_terms_version = v_acceptance.terms_version,
      seller_portal_terms_acceptance_id = v_acceptance.id,
      updated_at = now()
  where id = v_onboarding.id;

  perform public.bridge_log_client_portal_access_event(v_token, 'terms_accepted', 'success', v_listing.id, 'seller_portal_activation');

  return jsonb_build_object(
    'ok', true,
    'acceptanceId', v_acceptance.id,
    'listingId', v_listing.id,
    'sellerOnboardingId', v_onboarding.id,
    'termsVersion', v_acceptance.terms_version,
    'feeAmount', v_acceptance.fee_amount,
    'currency', v_acceptance.currency,
    'acceptedAt', v_acceptance.accepted_at
  );
end;
$$;

revoke all on function public.bridge_record_seller_portal_activation_terms(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.bridge_record_seller_portal_activation_terms(text, jsonb)
  to anon, authenticated;

create or replace function public.bridge_issue_private_listing_seller_portal_invite(
  p_token text,
  p_ttl_hours integer default 72
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_invite_token text := 'seller-invite-' || encode(gen_random_bytes(32), 'hex');
  v_invite_hash text := encode(digest(v_invite_token, 'sha256'), 'hex');
  v_ttl_hours integer := greatest(1, least(coalesce(p_ttl_hours, 72), 168));
  v_expires_at timestamptz := now() + make_interval(hours => greatest(1, least(coalesce(p_ttl_hours, 72), 168)));
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication is required to issue a seller portal invitation.';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);

  if not found or not v_resolution.token_valid or v_resolution.token_kind = 'invite' then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id
  for update;

  select * into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id;

  if not found or not public.bridge_private_listing_seller_portal_link_is_active(to_jsonb(v_onboarding), to_jsonb(v_listing)) then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;

  update public.private_listing_seller_onboarding
  set seller_portal_invite_token_hash = v_invite_hash,
      seller_portal_invite_created_at = now(),
      seller_portal_invite_expires_at = v_expires_at,
      seller_portal_invite_consumed_at = null,
      seller_portal_invite_generation = seller_portal_invite_generation + 1,
      seller_portal_status = 'invitation_sent',
      seller_portal_invitation_sent_at = coalesce(seller_portal_invitation_sent_at, now()),
      seller_portal_invitation_last_sent_at = now(),
      seller_portal_invitation_cancelled_at = null,
      updated_at = now()
  where id = v_onboarding.id;

  perform public.bridge_log_client_portal_access_event(
    v_invite_token,
    'invite_issued',
    'success',
    v_listing.id,
    'one_time_invite_created'
  );

  return jsonb_build_object(
    'ok', true,
    'inviteToken', v_invite_token,
    'inviteExpiresAt', v_expires_at,
    'ttlHours', v_ttl_hours,
    'stablePortalToken', v_onboarding.seller_portal_token,
    'listingId', v_listing.id,
    'portalStatus', 'invitation_sent',
    'activationSource', coalesce(v_onboarding.seller_portal_activation_source, 'existing_listing')
  );
end;
$$;

grant execute on function public.bridge_issue_private_listing_seller_portal_invite(text, integer) to authenticated;

create or replace function public.bridge_manage_private_listing_seller_portal(
  p_token text,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_reason text := left(nullif(trim(coalesce(p_reason, '')), ''), 240);
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication is required to manage seller portal access.';
  end if;
  if v_action not in ('revoke', 'reactivate', 'revoke_sessions') then
    raise exception 'Unsupported seller portal management action.';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or v_resolution.token_kind = 'invite' then
    raise exception 'Seller portal link is invalid.';
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id
  for update;

  if v_action = 'revoke' then
    update public.private_listing_seller_onboarding
    set seller_portal_link_active = false,
        seller_portal_revoked_at = now(),
        seller_portal_revoked_by = auth.uid(),
        seller_portal_revocation_reason = coalesce(v_reason, 'Revoked by property representative'),
        seller_portal_access_token_hash = null,
        seller_portal_access_token_expires_at = null,
        seller_portal_invite_token_hash = null,
        seller_portal_invite_consumed_at = now(),
        seller_portal_status = 'invitation_cancelled',
        seller_portal_invitation_cancelled_at = now(),
        updated_at = now()
    where id = v_onboarding.id;
  elsif v_action = 'reactivate' then
    update public.private_listing_seller_onboarding
    set seller_portal_link_active = true,
        seller_portal_revoked_at = null,
        seller_portal_revoked_by = null,
        seller_portal_revocation_reason = null,
        seller_portal_failed_login_count = 0,
        seller_portal_last_failed_login_at = null,
        seller_portal_locked_until = null,
        seller_portal_status = case
          when seller_portal_password_hash is not null and status in ('completed', 'submitted', 'approved') then 'profile_complete'
          when seller_portal_password_hash is not null then 'activated'
          when seller_portal_invite_created_at is not null then 'invitation_sent'
          when seller_portal_token is not null then 'invitation_pending'
          else 'not_activated'
        end,
        seller_portal_invitation_cancelled_at = null,
        updated_at = now()
    where id = v_onboarding.id;
  else
    update public.private_listing_seller_onboarding
    set seller_portal_access_token_hash = null,
        seller_portal_access_token_expires_at = null,
        updated_at = now()
    where id = v_onboarding.id;
  end if;

  perform public.bridge_log_client_portal_access_event(
    v_resolution.stable_portal_token,
    'portal_' || v_action,
    'success',
    v_onboarding.private_listing_id,
    coalesce(v_reason, v_action)
  );

  select onboarding.* into v_onboarding
  from public.private_listing_seller_onboarding onboarding
  where onboarding.id = v_resolution.onboarding_id;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'linkActive', coalesce(v_onboarding.seller_portal_link_active, true),
    'revokedAt', v_onboarding.seller_portal_revoked_at,
    'revocationReason', v_onboarding.seller_portal_revocation_reason,
    'stablePortalToken', v_onboarding.seller_portal_token,
    'stablePortalPath', '/client/' || v_onboarding.seller_portal_token || '/selling',
    'portalStatus', v_onboarding.seller_portal_status,
    'invitationCancelledAt', v_onboarding.seller_portal_invitation_cancelled_at,
    'sessionsRevoked', v_action in ('revoke', 'revoke_sessions')
  );
end;
$$;

grant execute on function public.bridge_manage_private_listing_seller_portal(text, text, text) to authenticated;

create or replace function public.bridge_private_listing_seller_portal_access_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_result jsonb;
begin
  select * into v_resolution from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found then
    perform public.bridge_log_client_portal_access_event(p_token, 'access_state', 'failure', null, 'token_invalid');
    return jsonb_build_object('valid', false, 'reason', 'token_invalid');
  end if;
  if not v_resolution.token_valid then
    perform public.bridge_log_client_portal_access_event(p_token, 'access_state', 'failure', null, 'invite_expired_or_consumed');
    return jsonb_build_object(
      'valid', false,
      'reason', 'invite_expired_or_consumed',
      'tokenKind', v_resolution.token_kind,
      'stablePortalToken', v_resolution.stable_portal_token
    );
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id;

  v_result := public.bridge_private_listing_seller_portal_access_state_phase1(v_resolution.legacy_token);
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'tokenKind', v_resolution.token_kind,
    'stablePortalToken', v_resolution.stable_portal_token,
    'stablePortalPath', '/client/' || v_resolution.stable_portal_token || '/selling',
    'portalStatus', v_onboarding.seller_portal_status,
    'activationSource', v_onboarding.seller_portal_activation_source,
    'invitationSentAt', v_onboarding.seller_portal_invitation_sent_at,
    'invitationLastSentAt', v_onboarding.seller_portal_invitation_last_sent_at,
    'activatedAt', v_onboarding.seller_portal_activated_at,
    'termsAcceptedAt', v_onboarding.seller_portal_terms_accepted_at,
    'termsVersion', v_onboarding.seller_portal_terms_version,
    'termsAccepted', v_onboarding.seller_portal_terms_accepted_at is not null
  );
end;
$$;

grant execute on function public.bridge_private_listing_seller_portal_access_state(text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
