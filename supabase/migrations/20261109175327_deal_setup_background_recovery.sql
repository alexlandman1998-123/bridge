begin;

-- The existing pending marker IS the outbox: committing commercial terms also
-- commits recoverable work, even when the browser loses the save response.
alter table public.transactions
  add column deal_setup_sync_attempts integer not null default 0 check (deal_setup_sync_attempts between 0 and 1000000),
  add column deal_setup_sync_next_at timestamptz,
  add column deal_setup_sync_lease_id uuid,
  add column deal_setup_sync_lease_until timestamptz;

create index transaction_deal_setup_recovery_due_idx
  on public.transactions (deal_setup_sync_next_at, id)
  where deal_setup_sync_status in ('pending', 'failed') and deal_setup_terms_version is not null;

create function public.bridge_reset_deal_setup_recovery() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.deal_setup_terms_version is distinct from old.deal_setup_terms_version then
    new.deal_setup_sync_attempts := 0;
    new.deal_setup_sync_lease_id := null;
    new.deal_setup_sync_lease_until := null;
    if new.deal_setup_terms_version is not null then
      new.deal_setup_sync_status := 'pending';
      new.deal_setup_sync_error := null;
      new.deal_setup_sync_next_at := now();
    else
      new.deal_setup_sync_next_at := null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.bridge_reset_deal_setup_recovery() from public, anon, authenticated;
create trigger deal_setup_recovery_reset before update on public.transactions
for each row execute function public.bridge_reset_deal_setup_recovery();

-- Lease identity travels in server-only request headers on every derived write.
-- Locking the parent here serializes each write against a newer commercial save.
create function public.bridge_assert_deal_setup_recovery_fence(p_transaction_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  h jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  t public.transactions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     or p_transaction_id is distinct from nullif(h->>'x-arch9-deal-transaction', '')::uuid then
    raise exception 'Invalid recovery scope.' using errcode = '42501';
  end if;
  select * into t from public.transactions where id = p_transaction_id for update;
  if not found
     or t.deal_setup_terms_version is distinct from nullif(h->>'x-arch9-deal-version', '')::uuid
     or t.deal_setup_sync_lease_id is null
     or t.deal_setup_sync_lease_id is distinct from nullif(h->>'x-arch9-deal-lease', '')::uuid
     or t.deal_setup_sync_lease_until is null or t.deal_setup_sync_lease_until <= clock_timestamp()
     or t.deal_setup_sync_status not in ('pending', 'failed') then
    raise exception 'Recovery lease expired or deal changed.' using errcode = '40001';
  end if;
end;
$$;
revoke all on function public.bridge_assert_deal_setup_recovery_fence(uuid) from public, anon, authenticated;
grant execute on function public.bridge_assert_deal_setup_recovery_fence(uuid) to service_role;

create function public.bridge_guard_deal_setup_recovery_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  h jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  r jsonb;
  tx uuid;
begin
  if not (h ?| array['x-arch9-deal-transaction','x-arch9-deal-version','x-arch9-deal-lease']) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  -- Check both identities on updates; a scoped worker cannot move a row out of
  -- another transaction, including events whose owner is an instance.
  for r in select value from jsonb_array_elements(case tg_op
    when 'INSERT' then jsonb_build_array(to_jsonb(new))
    when 'DELETE' then jsonb_build_array(to_jsonb(old))
    else jsonb_build_array(to_jsonb(old), to_jsonb(new)) end)
  loop
    if tg_table_name = 'transactions' then tx := (r->>'id')::uuid;
    elsif tg_table_name = 'document_requirement_events' then
      select coalesce(transaction_id, context_id) into tx from public.document_requirement_instances
        where id = (r->>'requirement_instance_id')::uuid and context_type = 'transaction';
    else tx := coalesce(nullif(r->>'transaction_id', ''), case when r->>'context_type' = 'transaction' then r->>'context_id' end)::uuid;
    end if;
    perform public.bridge_assert_deal_setup_recovery_fence(tx);
  end loop;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.bridge_guard_deal_setup_recovery_write() from public, anon, authenticated;

create trigger deal_setup_recovery_write_fence before update on public.transactions
for each row execute function public.bridge_guard_deal_setup_recovery_write();
create trigger deal_setup_recovery_write_fence before insert or update or delete on public.document_requirement_instances
for each row execute function public.bridge_guard_deal_setup_recovery_write();
create trigger deal_setup_recovery_write_fence before insert or update or delete on public.document_requirement_events
for each row execute function public.bridge_guard_deal_setup_recovery_write();
create trigger deal_setup_recovery_write_fence before insert or update or delete on public.transaction_document_requirements
for each row execute function public.bridge_guard_deal_setup_recovery_write();
create trigger deal_setup_recovery_write_fence before insert or update or delete on public.transaction_required_documents
for each row execute function public.bridge_guard_deal_setup_recovery_write();

create function public.bridge_claim_deal_setup_recovery() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t public.transactions%rowtype; lease uuid := gen_random_uuid();
begin
  select * into t from public.transactions
  where deal_setup_terms_version is not null and deal_setup_sync_status in ('pending', 'failed')
    and coalesce(deal_setup_sync_next_at, '-infinity'::timestamptz) <= now()
    and coalesce(deal_setup_sync_lease_until, '-infinity'::timestamptz) <= now()
  order by deal_setup_sync_next_at nulls first, id
  limit 1 for update skip locked;
  if not found then return null; end if;
  update public.transactions set deal_setup_sync_lease_id = lease,
    deal_setup_sync_lease_until = now() + interval '3 minutes',
    deal_setup_sync_attempts = least(deal_setup_sync_attempts, 999999) + 1
  where id = t.id;
  return jsonb_build_object('transaction_id', t.id, 'terms_version', t.deal_setup_terms_version, 'lease_id', lease);
end;
$$;
revoke all on function public.bridge_claim_deal_setup_recovery() from public, anon, authenticated;
grant execute on function public.bridge_claim_deal_setup_recovery() to service_role;

create function public.bridge_finish_deal_setup_recovery(p_transaction_id uuid, p_terms_version uuid, p_lease_id uuid, p_succeeded boolean) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t public.transactions%rowtype;
begin
  select * into t from public.transactions where id = p_transaction_id for update;
  if not found or t.deal_setup_terms_version is distinct from p_terms_version
    or t.deal_setup_sync_lease_id is null or t.deal_setup_sync_lease_id is distinct from p_lease_id
    or t.deal_setup_sync_lease_until is null or t.deal_setup_sync_lease_until <= clock_timestamp()
    or t.deal_setup_sync_status not in ('pending', 'failed') then
    return jsonb_build_object('accepted', false);
  end if;
  update public.transactions set
    deal_setup_sync_status = case when p_succeeded then 'complete' else 'failed' end,
    deal_setup_sync_error = case when p_succeeded then null else 'Related workflow updates are delayed. Automatic recovery will retry.' end,
    deal_setup_sync_next_at = case when p_succeeded then null else now() + make_interval(secs => least(1800, 60 * power(2, least(t.deal_setup_sync_attempts - 1, 5))::integer)) end,
    deal_setup_sync_lease_id = null, deal_setup_sync_lease_until = null
  where id = t.id;
  return jsonb_build_object('accepted', true);
end;
$$;
revoke all on function public.bridge_finish_deal_setup_recovery(uuid,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.bridge_finish_deal_setup_recovery(uuid,uuid,uuid,boolean) to service_role;

create function public.bridge_retry_deal_setup_reconciliation(p_transaction_id uuid, p_terms_version uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t public.transactions%rowtype;
begin
  if auth.uid() is null or not public.bridge_has_transaction_permission(p_transaction_id, 'edit_core_transaction') then
    raise exception 'Transaction edit access is required.' using errcode = '42501';
  end if;
  select * into t from public.transactions where id = p_transaction_id for update;
  if not found or t.deal_setup_terms_version is distinct from p_terms_version or p_terms_version is null then
    raise exception 'Deal Setup changed. Reload before retrying its updates.' using errcode = '40001';
  end if;
  if t.deal_setup_sync_status in ('pending', 'failed') then
    update public.transactions set deal_setup_sync_next_at = now() where id = t.id;
  end if;
  return jsonb_build_object('status', t.deal_setup_sync_status, 'automatic', true);
end;
$$;
revoke all on function public.bridge_retry_deal_setup_reconciliation(uuid,uuid) from public, anon;
grant execute on function public.bridge_retry_deal_setup_reconciliation(uuid,uuid) to authenticated;

-- Ordinary users retain the original access checks. A service worker may use
-- the same handoff logic only under a current version-bound recovery lease.
create or replace function public.bridge_sync_deal_setup_attorney_handoff(p_transaction_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := auth.uid();
  v_transaction public.transactions%rowtype;
  v_profile jsonb;
  v_requires_bond_attorney boolean;
begin
  if p_transaction_id is null then raise exception 'Transaction id is required.' using errcode = '22023'; end if;
  if coalesce(auth.role(), '') = 'service_role' then
    perform public.bridge_assert_deal_setup_recovery_fence(p_transaction_id);
  else
    if v_actor_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
    if not (public.bridge_can_access_transaction_spine(p_transaction_id) or public.bridge_can_access_transaction_org_member(p_transaction_id)) then
      raise exception 'You do not have access to this transaction.' using errcode = '42501';
    end if;
  end if;
  select * into v_transaction from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction not found.' using errcode = 'P0002'; end if;
  v_requires_bond_attorney := lower(coalesce(v_transaction.finance_type, '')) in ('bond','hybrid','combination');
  v_profile := coalesce(v_transaction.routing_profile_json, '{}'::jsonb)
    - 'financeType' - 'finance_type' - 'transactionType' - 'transaction_type'
    - 'buyerEntityType' - 'buyer_entity_type' - 'purchaserType' - 'purchaser_type'
    - 'requiresBondAttorney' - 'workflowPlan';
  v_profile := v_profile || jsonb_strip_nulls(jsonb_build_object(
    'financeType', nullif(trim(v_transaction.finance_type), ''),
    'transactionType', nullif(trim(v_transaction.transaction_type), ''),
    'buyerEntityType', nullif(trim(v_transaction.purchaser_type), ''),
    'purchaserType', nullif(trim(v_transaction.purchaser_type), '')
  )) || jsonb_build_object('requiresBondAttorney', v_requires_bond_attorney,
    'dealSetupSync', jsonb_build_object('version','deal_setup_attorney_handoff_v1','syncedAt',now(),'syncedBy',v_actor_id));
  update public.transactions set routing_profile_json = v_profile, updated_at = now() where id = p_transaction_id;
  return jsonb_build_object('transactionId',p_transaction_id,'financeType',v_transaction.finance_type,
    'transactionType',v_transaction.transaction_type,'purchaserType',v_transaction.purchaser_type,
    'requiresBondAttorney',v_requires_bond_attorney,'routingProfileRefreshed',true,'workflowPlanInvalidated',true);
end;
$$;
revoke all on function public.bridge_sync_deal_setup_attorney_handoff(uuid) from public, anon;
grant execute on function public.bridge_sync_deal_setup_attorney_handoff(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
