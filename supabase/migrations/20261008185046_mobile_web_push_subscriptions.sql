begin;

-- Browser endpoints and encryption material are accessible only to the server.
create table public.mobile_web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint_hash text not null unique,
  subscription jsonb not null,
  vapid_public_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(subscription) = 'object'),
  check (length(endpoint_hash) = 64)
);
create index mobile_web_push_subscriptions_user_idx on public.mobile_web_push_subscriptions(user_id);
create table public.mobile_web_push_test_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_test_at timestamptz not null
);
alter table public.mobile_web_push_subscriptions enable row level security;
alter table public.mobile_web_push_test_limits enable row level security;
revoke all on public.mobile_web_push_subscriptions, public.mobile_web_push_test_limits from public, anon, authenticated;
grant select, insert, update, delete on public.mobile_web_push_subscriptions, public.mobile_web_push_test_limits to service_role;

-- The API supplies the user ID only after auth.getUser verifies the bearer token.
create function public.register_mobile_web_push(p_user_id uuid, p_endpoint_hash text, p_subscription jsonb, p_vapid_public_key text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.mobile_web_push_subscriptions(user_id, endpoint_hash, subscription, vapid_public_key)
  values(p_user_id, p_endpoint_hash, p_subscription, p_vapid_public_key)
  on conflict(endpoint_hash) do update set subscription = excluded.subscription,
    vapid_public_key = excluded.vapid_public_key, updated_at = now()
  where public.mobile_web_push_subscriptions.user_id = excluded.user_id
  returning id into v_id;
  if v_id is null then raise exception 'subscription_owned_by_another_account'; end if;
  return v_id;
end;
$$;

-- Atomically reserve the account's next send; deletion/re-registration cannot reset it.
create function public.claim_mobile_web_push_test(p_user_id uuid, p_subscription_id uuid, p_vapid_public_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_subscription jsonb; v_user_id uuid;
begin
  select subscription into v_subscription from public.mobile_web_push_subscriptions
  where id = p_subscription_id and user_id = p_user_id and vapid_public_key = p_vapid_public_key;
  if v_subscription is null then return jsonb_build_object('status', 'not_registered'); end if;
  insert into public.mobile_web_push_test_limits(user_id, last_test_at) values(p_user_id, now())
  on conflict(user_id) do update set last_test_at = excluded.last_test_at
  where public.mobile_web_push_test_limits.last_test_at <= now() - interval '30 seconds'
  returning user_id into v_user_id;
  if v_user_id is null then return jsonb_build_object('status', 'rate_limited'); end if;
  return jsonb_build_object('status', 'claimed', 'subscription', v_subscription);
end;
$$;
revoke all on function public.register_mobile_web_push(uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.claim_mobile_web_push_test(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.register_mobile_web_push(uuid, text, jsonb, text) to service_role;
grant execute on function public.claim_mobile_web_push_test(uuid, uuid, text) to service_role;
notify pgrst, 'reload schema';
commit;
