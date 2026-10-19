begin;
set local lock_timeout = '5s';

alter table public.knowledge_factory_package_commercial_policies
  drop constraint knowledge_factory_package_commercial_polici_rollout_stage_check,
  add constraint kf_package_rollout_stage_check
    check (rollout_stage in ('controlled_uat','pilot','production','suspended'));
alter table public.knowledge_factory_report_purchase_intents
  add column supplier_environment text not null default 'uat' check (supplier_environment in ('uat','live'));

-- An explicit reviewed ceiling is separate from supplier-validated billing.
create table public.knowledge_factory_report_cost_approvals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  product_id text not null check (product_id in ('basic_owner_lookup','full_canvassing_report')),
  supplier_environment text not null check (supplier_environment in ('uat','live')),
  supplier_query_sha256 text not null check (supplier_query_sha256 ~ '^[0-9a-f]{64}$'),
  schedule_version text not null check (schedule_version = 'kf-v1-2026-09-22'),
  maximum_credits integer not null check (maximum_credits > 0),
  evidence_audit_id uuid not null references public.knowledge_factory_audit_log(id),
  supplier_reference text not null check (length(btrim(supplier_reference)) between 3 and 250),
  review_note text not null check (length(btrim(review_note)) between 10 and 1000),
  reviewed_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);
create index knowledge_factory_report_approval_current_idx on public.knowledge_factory_report_cost_approvals
  (organisation_id,product_id,supplier_environment,created_at desc) where revoked_at is null;

create table public.knowledge_factory_report_credit_ledger (
  purchase_intent_id uuid primary key references public.knowledge_factory_report_purchase_intents(id),
  organisation_id uuid not null references public.organisations(id),
  actor_id uuid not null references auth.users(id),
  supplier_environment text not null check (supplier_environment in ('uat','live')),
  approval_id uuid not null references public.knowledge_factory_report_cost_approvals(id),
  reserved_credits integer not null check (reserved_credits > 0),
  charged_credits bigint check (charged_credits >= 0),
  deducted_credits bigint check (deducted_credits >= 0),
  status text not null check (status in ('reserved','dispatched','settled','review_required','released','completed')),
  vendor_request_id text check (length(vendor_request_id) <= 200),
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  charged_at timestamptz,
  completed_at timestamptz
);
create index knowledge_factory_report_credit_org_idx on public.knowledge_factory_report_credit_ledger (organisation_id,created_at);
create index knowledge_factory_report_credit_actor_idx on public.knowledge_factory_report_credit_ledger (organisation_id,actor_id,created_at);

create table public.knowledge_factory_report_invoices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  invoice_month date not null check (extract(day from invoice_month)=1),
  currency text not null default 'ZAR' check (currency='ZAR'),
  status text not null default 'draft' check (status in ('draft','issued')),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organisation_id,invoice_month)
);
create table public.knowledge_factory_report_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.knowledge_factory_report_invoices(id),
  purchase_intent_id uuid not null unique references public.knowledge_factory_report_purchase_intents(id),
  report_result_id uuid not null unique references public.knowledge_factory_report_results(id),
  product_name text not null,
  amount_cents integer not null check (amount_cents between 0 and 100000),
  created_at timestamptz not null default now()
);
create index knowledge_factory_report_invoice_lines_invoice_idx on public.knowledge_factory_report_invoice_lines(invoice_id);

alter table public.knowledge_factory_report_cost_approvals enable row level security;
alter table public.knowledge_factory_report_credit_ledger enable row level security;
alter table public.knowledge_factory_report_invoices enable row level security;
alter table public.knowledge_factory_report_invoice_lines enable row level security;
revoke all on public.knowledge_factory_report_cost_approvals, public.knowledge_factory_report_credit_ledger,
  public.knowledge_factory_report_invoices, public.knowledge_factory_report_invoice_lines from public,anon,authenticated,service_role;
grant select,insert on public.knowledge_factory_report_cost_approvals, public.knowledge_factory_report_credit_ledger,
  public.knowledge_factory_report_invoices, public.knowledge_factory_report_invoice_lines to service_role;
grant update(revoked_at) on public.knowledge_factory_report_cost_approvals to service_role;
grant update on public.knowledge_factory_report_credit_ledger to service_role;
grant update(status,issued_at,organisation_id) on public.knowledge_factory_report_invoices to service_role;

-- All mutating RPCs are invoker functions callable only by the private server.
-- The policy row lock serializes reservations for an agency. No HTTP work occurs
-- inside a database transaction. Uncertain supplier calls retain their hold.
create function public.knowledge_factory_reserve_report_credits(
  p_intent_id uuid, p_actor_id uuid, p_maximum_credits integer, p_environment text, p_query_sha256 text, p_approval_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  i public.knowledge_factory_report_purchase_intents%rowtype;
  p public.knowledge_factory_package_commercial_policies%rowtype;
  a public.knowledge_factory_report_cost_approvals%rowtype;
  pilot public.knowledge_factory_package_pilot_enrolments%rowtype;
  spent bigint; reports bigint; daily bigint; hourly bigint; cap integer;
  month_start timestamptz := date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
  day_start timestamptz := date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
  select * into i from public.knowledge_factory_report_purchase_intents where id=p_intent_id;
  if not found or i.actor_id<>p_actor_id or i.status<>'executing' or i.quote_expires_at<=now()
    or i.supplier_environment<>p_environment or p_environment is null or p_environment not in ('uat','live') or p_query_sha256 is null or p_query_sha256 !~ '^[0-9a-f]{64}$' or i.quoted_supplier_credits is null or p_maximum_credits is null or p_maximum_credits<=0
    or p_maximum_credits>i.quoted_supplier_credits then raise exception 'Report reservation is not permitted'; end if;
  select * into p from public.knowledge_factory_package_commercial_policies where organisation_id=i.organisation_id for update;
  if not found or p.rollout_stage='suspended' or not (i.product_id=any(p.allowed_product_ids))
    or (p_environment='live' and p.rollout_stage<>'production')
    or (p_environment='uat' and p.rollout_stage='production') then raise exception 'Report rollout is not enabled'; end if;
  if not exists(select 1 from public.organisation_users u where u.organisation_id=i.organisation_id and u.user_id=p_actor_id and lower(coalesce(u.membership_status,u.status,''))='active')
    or not exists(select 1 from public.knowledge_factory_organisation_access x where x.organisation_id=i.organisation_id and x.enabled and x.suspended_at is null and 'property_report'=any(x.allowed_operations))
    or not exists(select 1 from public.knowledge_factory_user_permissions x where x.organisation_id=i.organisation_id and x.user_id=p_actor_id and x.revoked_at is null and 'property_report'=any(x.allowed_operations))
    or not exists(select 1 from public.knowledge_factory_report_products x where x.organisation_id=i.organisation_id and x.product_id=i.product_id and x.status='uat_validated')
    then raise exception 'Current report access is required'; end if;
  select * into a from public.knowledge_factory_report_cost_approvals where id=p_approval_id;
  if not found or a.organisation_id<>i.organisation_id or a.product_id<>i.product_id or a.supplier_environment<>p_environment
    or a.supplier_query_sha256<>p_query_sha256 or a.revoked_at is not null or a.expires_at<=now()
    or p_maximum_credits>a.maximum_credits then raise exception 'Current report cost approval is required'; end if;
  if exists(select 1 from public.knowledge_factory_report_credit_ledger where purchase_intent_id=i.id and status<>'released')
    then raise exception 'This report already has a reservation; do not repeat the supplier request'; end if;
  cap:=case when i.product_id='basic_owner_lookup' then p.basic_report_credit_cap else p.full_report_credit_cap end;
  select coalesce(sum(case when status in ('reserved','dispatched','review_required') then greatest(reserved_credits,coalesce(charged_credits,0),coalesce(deducted_credits,0)) else greatest(coalesce(charged_credits,0),coalesce(deducted_credits,0)) end),0),count(*),
    count(*) filter(where actor_id=p_actor_id and created_at>=day_start),
    count(*) filter(where actor_id=p_actor_id and created_at>=now()-interval '1 hour')
  into spent,reports,daily,hourly from public.knowledge_factory_report_credit_ledger
  where organisation_id=i.organisation_id and status<>'released'
    and (created_at>=month_start or status in ('reserved','dispatched','review_required'));
  -- Existing completed reports remain counted after deployment, without double counting.
  select spent+coalesce(sum(r.credits_consumed),0),reports+count(*),daily+count(*) filter(where r.actor_id=p_actor_id and r.executed_at>=day_start)
    into spent,reports,daily from public.knowledge_factory_report_results r where r.organisation_id=i.organisation_id and r.executed_at>=month_start
      and not exists(select 1 from public.knowledge_factory_report_credit_ledger l where l.purchase_intent_id=r.purchase_intent_id);
  if p_maximum_credits>least(cap,p.per_report_credit_cap) or spent+p_maximum_credits>p.monthly_credit_cap
    or reports>=p.monthly_report_cap or daily>=p.daily_report_cap_per_user or hourly>=8 then raise exception 'Report spending or request limit reached'; end if;
  if p.rollout_stage='pilot' then
    select * into pilot from public.knowledge_factory_package_pilot_enrolments where organisation_id=i.organisation_id;
    if not found or pilot.status<>'active' or pilot.pilot_ends_at<=now() or not(p_actor_id=any(pilot.allowed_user_ids)) then raise exception 'Current named pilot access is required'; end if;
    select coalesce(sum(greatest(reserved_credits,coalesce(charged_credits,0),coalesce(deducted_credits,0))),0),count(*) into spent,reports
    from public.knowledge_factory_report_credit_ledger where organisation_id=i.organisation_id and status<>'released' and created_at>=pilot.activated_at;
    select spent+coalesce(sum(r.credits_consumed),0),reports+count(*) into spent,reports from public.knowledge_factory_report_results r
      where r.organisation_id=i.organisation_id and r.executed_at>=pilot.activated_at and not exists(select 1 from public.knowledge_factory_report_credit_ledger l where l.purchase_intent_id=r.purchase_intent_id);
    if spent+p_maximum_credits>pilot.pilot_credit_cap or reports>=pilot.pilot_report_cap then raise exception 'Pilot report budget reached'; end if;
  end if;
  insert into public.knowledge_factory_report_credit_ledger(purchase_intent_id,organisation_id,actor_id,supplier_environment,approval_id,reserved_credits,status)
  values(i.id,i.organisation_id,p_actor_id,p_environment,a.id,p_maximum_credits,'reserved')
  on conflict(purchase_intent_id) do update set reserved_credits=excluded.reserved_credits,approval_id=excluded.approval_id,status='reserved',created_at=now();
  return jsonb_build_object('reserved',true);
end $$;

create function public.knowledge_factory_record_report_charge(p_intent_id uuid,p_actor_id uuid,p_action text,p_credits bigint default null,p_deducted bigint default null,p_vendor_request_id text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.knowledge_factory_report_credit_ledger%rowtype;
begin
  select * into l from public.knowledge_factory_report_credit_ledger where purchase_intent_id=p_intent_id and actor_id=p_actor_id for update;
  if not found then raise exception 'Report reservation not found'; end if;
  if p_action='dispatch' and l.status='reserved' then
    update public.knowledge_factory_report_credit_ledger set status='dispatched',dispatched_at=now() where purchase_intent_id=p_intent_id;
  elsif p_action='release' and l.status='reserved' then
    update public.knowledge_factory_report_credit_ledger set status='released' where purchase_intent_id=p_intent_id;
  elsif p_action='charge' and l.status='dispatched' then
    if p_credits<0 or p_deducted<0 then raise exception 'Invalid supplier charge'; end if;
    update public.knowledge_factory_report_credit_ledger set
      charged_credits=p_credits,deducted_credits=p_deducted,charged_at=now(),vendor_request_id=p_vendor_request_id,
      status=case when p_credits is null or p_deducted is null or greatest(p_credits,p_deducted)>reserved_credits then 'review_required' else 'settled' end
    where purchase_intent_id=p_intent_id;
  else raise exception 'Report accounting state cannot be repeated or changed'; end if;
  return jsonb_build_object('recorded',true);
end $$;

-- Save the report, complete its intent and append exactly one live invoice line
-- in the same transaction. Failed saves cannot create customer invoice charges.
create function public.knowledge_factory_complete_report(p_intent_id uuid,p_actor_id uuid,p_request jsonb,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare i public.knowledge_factory_report_purchase_intents%rowtype; l public.knowledge_factory_report_credit_ledger%rowtype;
  request_id uuid; saved public.knowledge_factory_report_results%rowtype; invoice_id uuid;
begin
  select * into i from public.knowledge_factory_report_purchase_intents where id=p_intent_id and actor_id=p_actor_id for update;
  if not found then raise exception 'Report purchase not found'; end if;
  if i.status='executed' then select * into saved from public.knowledge_factory_report_results where purchase_intent_id=i.id; return to_jsonb(saved); end if;
  select * into l from public.knowledge_factory_report_credit_ledger where purchase_intent_id=i.id for update;
  if not found or i.status<>'executing' or l.status<>'settled' or l.actor_id<>p_actor_id then raise exception 'A settled supplier execution is required'; end if;
  insert into public.knowledge_factory_report_requests(organisation_id,actor_id,property_id,requested_report_types,request_purpose,status,confirmed_at,quote_expires_at,field_cost,type_cost,price_surcharge,credits_consumed,vendor_request_id,report_summary)
  values(i.organisation_id,i.actor_id,i.property_id,array[i.product_id],i.request_purpose,'ready',now(),now(),(p_request->>'field_cost')::integer,(p_request->>'type_cost')::integer,(p_request->>'price_surcharge')::integer,l.charged_credits,l.vendor_request_id,p_request->'report_summary') returning id into request_id;
  insert into public.knowledge_factory_report_results(organisation_id,purchase_intent_id,report_request_id,actor_id,product_id,property_id,report_data,report_snapshot_version,report_definition_snapshot,cost_validation_snapshot,request_context_snapshot,opportunity_signals,field_cost,type_cost,price_surcharge,credits_consumed,vendor_request_id)
  values(i.organisation_id,i.id,request_id,i.actor_id,i.product_id,i.property_id,p_result->'report_data','canvassing-report-v1',p_result->'report_definition_snapshot',p_result->'cost_validation_snapshot',p_result->'request_context_snapshot',p_result->'opportunity_signals',(p_request->>'field_cost')::integer,(p_request->>'type_cost')::integer,(p_request->>'price_surcharge')::integer,l.charged_credits,l.vendor_request_id) returning * into saved;
  update public.knowledge_factory_report_purchase_intents set status='executed',executed_at=now(),updated_at=now(),report_request_id=request_id where id=i.id;
  update public.knowledge_factory_report_credit_ledger set status='completed',completed_at=now() where purchase_intent_id=i.id;
  if l.supplier_environment='live' then
    insert into public.knowledge_factory_report_invoices(organisation_id,invoice_month) values(i.organisation_id,(date_trunc('month',now() at time zone 'UTC'))::date)
    on conflict(organisation_id,invoice_month) do update set organisation_id=excluded.organisation_id returning id into invoice_id;
    if exists(select 1 from public.knowledge_factory_report_invoices where id=invoice_id and status<>'draft') then raise exception 'Monthly report invoice is closed'; end if;
    insert into public.knowledge_factory_report_invoice_lines(invoice_id,purchase_intent_id,report_result_id,product_name,amount_cents)
    values(invoice_id,i.id,saved.id,i.product_name,i.customer_price_cents);
  end if;
  return to_jsonb(saved);
end $$;

revoke all on function public.knowledge_factory_reserve_report_credits(uuid,uuid,integer,text,text,uuid),
  public.knowledge_factory_record_report_charge(uuid,uuid,text,bigint,bigint,text),public.knowledge_factory_complete_report(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.knowledge_factory_reserve_report_credits(uuid,uuid,integer,text,text,uuid),
  public.knowledge_factory_record_report_charge(uuid,uuid,text,bigint,bigint,text),public.knowledge_factory_complete_report(uuid,uuid,jsonb,jsonb) to service_role;
comment on table public.knowledge_factory_report_credit_ledger is 'Private report accounting. Uncertain requests retain their maximum hold until reviewed; no automatic expiry or supplier retry.';
comment on table public.knowledge_factory_report_invoices is 'Monthly live report invoice drafts in ZAR. UAT reports never create customer invoice lines. No automatic delivery or payment collection.';
create table public.knowledge_factory_report_credit_reviews (
  id uuid primary key default gen_random_uuid(),
  purchase_intent_id uuid not null references public.knowledge_factory_report_credit_ledger(purchase_intent_id),
  reviewed_by uuid not null references auth.users(id),
  supplier_reference text not null check(length(btrim(supplier_reference)) between 3 and 250),
  charged_credits bigint not null check(charged_credits>=0),
  deducted_credits bigint not null check(deducted_credits>=0),
  created_at timestamptz not null default now()
);
alter table public.knowledge_factory_report_credit_reviews enable row level security;
revoke all on public.knowledge_factory_report_credit_reviews from public,anon,authenticated,service_role;
grant select,insert on public.knowledge_factory_report_credit_reviews to service_role;
revoke update on public.knowledge_factory_report_invoice_lines from service_role;

create function public.knowledge_factory_review_report_charge(p_intent_id uuid,p_actor_id uuid,p_organisation_id uuid,p_credits bigint,p_deducted bigint,p_reference text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.knowledge_factory_report_credit_ledger%rowtype;
begin
  select * into l from public.knowledge_factory_report_credit_ledger where purchase_intent_id=p_intent_id and organisation_id=p_organisation_id for update;
  if not found or l.status not in ('reserved','dispatched','review_required','settled') or p_credits is null or p_deducted is null or p_credits<0 or p_deducted<0
    or length(btrim(coalesce(p_reference,'')))<3 then raise exception 'Current supplier charge evidence is required'; end if;
  if coalesce(l.dispatched_at,l.created_at)>now()-interval '5 minutes' then raise exception 'Wait for the running report request to finish before reviewing its charge'; end if;
  if l.status='reserved' and (p_credits<>0 or p_deducted<>0) then raise exception 'An unsent report can only release a zero-charge reservation'; end if;
  insert into public.knowledge_factory_report_credit_reviews(purchase_intent_id,reviewed_by,supplier_reference,charged_credits,deducted_credits)
    values(l.purchase_intent_id,p_actor_id,p_reference,p_credits,p_deducted);
  update public.knowledge_factory_report_credit_ledger set status=case when l.status='reserved' then 'released' else 'settled' end,charged_credits=p_credits,deducted_credits=p_deducted,charged_at=now() where purchase_intent_id=p_intent_id;
  if l.status='reserved' then update public.knowledge_factory_report_purchase_intents set status='execution_failed',updated_at=now() where id=l.purchase_intent_id and status='executing'; end if;
  return jsonb_build_object('reviewed',true);
end $$;
create function public.knowledge_factory_issue_report_invoice(p_invoice_id uuid,p_organisation_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare i public.knowledge_factory_report_invoices%rowtype;
begin
  select * into i from public.knowledge_factory_report_invoices where id=p_invoice_id and organisation_id=p_organisation_id for update;
  if not found or i.invoice_month>=date_trunc('month',now() at time zone 'UTC')::date then raise exception 'Only a completed month can be invoiced'; end if;
  update public.knowledge_factory_report_invoices set status='issued',issued_at=coalesce(issued_at,now()) where id=i.id;
  return jsonb_build_object('issued',true);
end $$;
revoke all on function public.knowledge_factory_review_report_charge(uuid,uuid,uuid,bigint,bigint,text),public.knowledge_factory_issue_report_invoice(uuid,uuid) from public,anon,authenticated;
grant execute on function public.knowledge_factory_review_report_charge(uuid,uuid,uuid,bigint,bigint,text),public.knowledge_factory_issue_report_invoice(uuid,uuid) to service_role;
create function public.knowledge_factory_report_usage(p_organisation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 with ledger as (
  select * from public.knowledge_factory_report_credit_ledger where organisation_id=p_organisation_id and status<>'released'
    and (created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' or status in ('reserved','dispatched','review_required'))
 ), legacy as (
  select r.* from public.knowledge_factory_report_results r where r.organisation_id=p_organisation_id
    and r.executed_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'
    and not exists(select 1 from public.knowledge_factory_report_credit_ledger l where l.purchase_intent_id=r.purchase_intent_id)
 ) select jsonb_build_object(
  'monthStartsAt',date_trunc('month',now() at time zone 'UTC') at time zone 'UTC',
  'reportCount',(select count(*) from ledger where status='completed')+(select count(*) from legacy),
  'creditsConsumed',(select coalesce(sum(greatest(coalesce(charged_credits,0),coalesce(deducted_credits,0))),0) from ledger)+(select coalesce(sum(credits_consumed),0) from legacy),
  'creditsReserved',(select coalesce(sum(greatest(reserved_credits-greatest(coalesce(charged_credits,0),coalesce(deducted_credits,0)),0)),0) from ledger where status in ('reserved','dispatched','review_required')),
  'customerRevenueCents',(select coalesce(sum(l.amount_cents),0) from public.knowledge_factory_report_invoice_lines l join public.knowledge_factory_report_invoices i on i.id=l.invoice_id where i.organisation_id=p_organisation_id and i.invoice_month=date_trunc('month',now() at time zone 'UTC')::date)
 )
$$;
revoke all on function public.knowledge_factory_report_usage(uuid) from public,anon,authenticated;
grant execute on function public.knowledge_factory_report_usage(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
