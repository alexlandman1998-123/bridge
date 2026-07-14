begin;

create table if not exists public.private_listing_seller_portal_security_alerts (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.private_listing_seller_onboarding(id) on delete cascade,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  alert_type text not null check (alert_type in ('temporary_lockout')),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists private_listing_seller_portal_security_alerts_open_uidx
  on public.private_listing_seller_portal_security_alerts (onboarding_id, alert_type)
  where status = 'open';

create index if not exists private_listing_seller_portal_security_alerts_listing_idx
  on public.private_listing_seller_portal_security_alerts (private_listing_id, status, created_at desc);

alter table public.private_listing_seller_portal_security_alerts enable row level security;
revoke all on table public.private_listing_seller_portal_security_alerts from anon, authenticated;

comment on table public.private_listing_seller_portal_security_alerts is
  'Privacy-safe operational alerts for seller portal authentication. Raw portal, invitation, access, and password tokens are never stored.';

alter function public.bridge_verify_private_listing_seller_portal_password(text, text)
  rename to bridge_verify_private_listing_seller_portal_password_phase3;
revoke all on function public.bridge_verify_private_listing_seller_portal_password_phase3(text, text) from public, anon, authenticated;

create or replace function public.bridge_verify_private_listing_seller_portal_password(p_token text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_result jsonb;
  v_reason text;
begin
  v_result := public.bridge_verify_private_listing_seller_portal_password_phase3(p_token, p_password);
  v_reason := lower(trim(coalesce(v_result ->> 'reason', '')));

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);

  if found and v_reason = 'temporarily_locked' then
    if not exists (
      select 1
      from public.private_listing_seller_portal_security_alerts alert
      where alert.onboarding_id = v_resolution.onboarding_id
        and alert.alert_type = 'temporary_lockout'
        and alert.status = 'open'
    ) then
      insert into public.private_listing_seller_portal_security_alerts (
        onboarding_id,
        private_listing_id,
        alert_type,
        severity,
        status,
        details
      )
      select
        onboarding.id,
        onboarding.private_listing_id,
        'temporary_lockout',
        'warning',
        'open',
        jsonb_build_object(
          'lockedUntil', v_result ->> 'lockedUntil',
          'attemptsRemaining', coalesce((v_result ->> 'attemptsRemaining')::integer, 0),
          'source', 'seller_portal_password_verify'
        )
      from public.private_listing_seller_onboarding onboarding
      where onboarding.id = v_resolution.onboarding_id;
    end if;
  elsif found and coalesce((v_result ->> 'ok')::boolean, false) then
    update public.private_listing_seller_portal_security_alerts
    set status = 'resolved',
        resolved_at = now(),
        updated_at = now(),
        details = details || jsonb_build_object('resolution', 'successful_authentication')
    where onboarding_id = v_resolution.onboarding_id
      and alert_type = 'temporary_lockout'
      and status = 'open';
  end if;

  return v_result;
end;
$$;

create or replace function public.bridge_private_listing_seller_portal_diagnostics(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_resolution record;
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_recent_events jsonb := '[]'::jsonb;
  v_open_alerts jsonb := '[]'::jsonb;
  v_failed_events_24h integer := 0;
  v_success_events_24h integer := 0;
  v_health text := 'healthy';
  v_invite_status text := 'not_issued';
  v_session_status text := 'not_started';
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication is required to view seller portal diagnostics.';
  end if;

  select * into v_resolution
  from public.bridge_resolve_private_listing_seller_portal_token(p_token);
  if not found or v_resolution.token_kind = 'invite' then
    raise exception 'Seller portal link is invalid.';
  end if;

  select * into v_onboarding
  from public.private_listing_seller_onboarding
  where id = v_resolution.onboarding_id;
  select * into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id;

  v_invite_status := case
    when v_onboarding.seller_portal_invite_token_hash is null then 'not_issued'
    when v_onboarding.seller_portal_invite_consumed_at is not null then 'consumed'
    when v_onboarding.seller_portal_invite_expires_at <= now() then 'expired'
    else 'pending'
  end;
  v_session_status := case
    when v_onboarding.seller_portal_password_hash is null then 'password_not_set'
    when v_onboarding.seller_portal_access_token_hash is null then 'signed_out'
    when v_onboarding.seller_portal_access_token_expires_at <= now() then 'expired'
    else 'active'
  end;

  select
    count(*) filter (where event.outcome = 'failure'),
    count(*) filter (where event.outcome = 'success')
  into v_failed_events_24h, v_success_events_24h
  from public.client_portal_access_events event
  where event.private_listing_id = v_listing.id
    and event.created_at >= now() - interval '24 hours';

  select coalesce(jsonb_agg(to_jsonb(recent_event) order by recent_event.created_at desc), '[]'::jsonb)
  into v_recent_events
  from (
    select event.id, event.event_name, event.outcome, event.reason, event.created_at
    from public.client_portal_access_events event
    where event.private_listing_id = v_listing.id
    order by event.created_at desc
    limit 20
  ) recent_event;

  select coalesce(jsonb_agg(to_jsonb(open_alert) order by open_alert.created_at desc), '[]'::jsonb)
  into v_open_alerts
  from (
    select alert.id, alert.alert_type, alert.severity, alert.status, alert.details, alert.created_at
    from public.private_listing_seller_portal_security_alerts alert
    where alert.onboarding_id = v_onboarding.id
      and alert.status = 'open'
    order by alert.created_at desc
  ) open_alert;

  v_health := case
    when not coalesce(v_onboarding.seller_portal_link_active, true) then 'revoked'
    when v_onboarding.seller_portal_locked_until is not null and v_onboarding.seller_portal_locked_until > now() then 'locked'
    when jsonb_array_length(v_open_alerts) > 0 then 'attention_required'
    else 'healthy'
  end;

  return jsonb_build_object(
    'ok', true,
    'health', v_health,
    'linkActive', coalesce(v_onboarding.seller_portal_link_active, true),
    'stablePortalToken', v_onboarding.seller_portal_token,
    'listingId', v_listing.id,
    'invitation', jsonb_build_object(
      'status', v_invite_status,
      'createdAt', v_onboarding.seller_portal_invite_created_at,
      'expiresAt', v_onboarding.seller_portal_invite_expires_at,
      'consumedAt', v_onboarding.seller_portal_invite_consumed_at,
      'generation', v_onboarding.seller_portal_invite_generation
    ),
    'session', jsonb_build_object(
      'status', v_session_status,
      'expiresAt', v_onboarding.seller_portal_access_token_expires_at,
      'lastLoginAt', v_onboarding.seller_portal_last_login_at,
      'passwordSetAt', v_onboarding.seller_portal_password_set_at
    ),
    'authentication', jsonb_build_object(
      'failedLoginCount', v_onboarding.seller_portal_failed_login_count,
      'lastFailedLoginAt', v_onboarding.seller_portal_last_failed_login_at,
      'lockedUntil', v_onboarding.seller_portal_locked_until,
      'failedEvents24h', v_failed_events_24h,
      'successfulEvents24h', v_success_events_24h
    ),
    'openAlerts', v_open_alerts,
    'recentEvents', v_recent_events,
    'generatedAt', now()
  );
end;
$$;

create or replace function public.bridge_prune_client_portal_security_history(p_retention_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention_days integer := greatest(30, least(coalesce(p_retention_days, 90), 365));
  v_events_deleted integer := 0;
  v_alerts_deleted integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role is required to prune portal security history.';
  end if;

  delete from public.client_portal_access_events
  where created_at < now() - make_interval(days => v_retention_days);
  get diagnostics v_events_deleted = row_count;

  delete from public.private_listing_seller_portal_security_alerts
  where status = 'resolved'
    and resolved_at < now() - make_interval(days => v_retention_days);
  get diagnostics v_alerts_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'retentionDays', v_retention_days,
    'eventsDeleted', v_events_deleted,
    'alertsDeleted', v_alerts_deleted
  );
end;
$$;

grant execute on function public.bridge_verify_private_listing_seller_portal_password(text, text) to anon, authenticated;
grant execute on function public.bridge_private_listing_seller_portal_diagnostics(text) to authenticated;
grant execute on function public.bridge_prune_client_portal_security_history(integer) to service_role;

notify pgrst, 'reload schema';

commit;
