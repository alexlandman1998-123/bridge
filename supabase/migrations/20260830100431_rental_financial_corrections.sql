-- Rentals Phase 40: maker-checker corrections. Financial history remains append-only.
begin;

create table public.rental_financial_closed_periods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  tenancy_id uuid not null references public.rental_tenancies(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  status text not null default 'closed' check (status in ('closed', 'reopened')),
  reason text not null check (length(btrim(reason)) > 0),
  closed_by uuid not null references auth.users(id) on delete restrict,
  closed_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (tenancy_id, period_start, period_end)
);

create table public.rental_financial_correction_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  tenancy_id uuid not null references public.rental_tenancies(id) on delete restrict,
  correction_kind text not null check (correction_kind in ('adjustment', 'payment_reversal', 'adjustment_reversal')),
  adjustment_type text not null check (adjustment_type in ('debit', 'credit')),
  amount numeric(14,2) not null check (amount > 0),
  effective_date date not null,
  reason text not null check (length(btrim(reason)) > 0),
  original_payment_id uuid references public.rental_financial_payments(id) on delete restrict,
  original_adjustment_id uuid references public.rental_financial_adjustments(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  rejection_reason text,
  applied_adjustment_id uuid unique references public.rental_financial_adjustments(id) on delete restrict,
  check ((correction_kind = 'adjustment' and original_payment_id is null and original_adjustment_id is null) or (correction_kind = 'payment_reversal' and original_payment_id is not null and original_adjustment_id is null) or (correction_kind = 'adjustment_reversal' and original_payment_id is null and original_adjustment_id is not null))
);
create index rental_financial_correction_requests_tenancy_idx on public.rental_financial_correction_requests(tenancy_id, requested_at desc);
create unique index rental_financial_payment_reversal_once_idx on public.rental_financial_correction_requests(original_payment_id) where correction_kind = 'payment_reversal' and status in ('pending', 'applied');
create unique index rental_financial_adjustment_reversal_once_idx on public.rental_financial_correction_requests(original_adjustment_id) where correction_kind = 'adjustment_reversal' and status in ('pending', 'applied');

alter table public.rental_financial_adjustments add column correction_request_id uuid unique references public.rental_financial_correction_requests(id) on delete restrict;
alter table public.rental_financial_closed_periods enable row level security;
alter table public.rental_financial_correction_requests enable row level security;
revoke all on public.rental_financial_closed_periods, public.rental_financial_correction_requests from anon, authenticated;
grant select on public.rental_financial_closed_periods, public.rental_financial_correction_requests to authenticated;
create policy rental_financial_closed_periods_staff_read on public.rental_financial_closed_periods for select to authenticated using (exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));
create policy rental_financial_corrections_staff_read on public.rental_financial_correction_requests for select to authenticated using (exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));

create or replace function public.rental_financial_manager_authorized(p_organisation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.bridge_membership_role(p_organisation_id) in ('owner', 'principal', 'director', 'partner', 'admin', 'super_admin', 'manager', 'hq_manager', 'branch_manager');
$$;

create or replace function public.rental_financial_period_is_closed(p_tenancy_id uuid, p_effective_date date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rental_financial_closed_periods period where period.tenancy_id = p_tenancy_id and period.status = 'closed' and p_effective_date between period.period_start and period.period_end);
$$;

create or replace function public.rental_request_financial_adjustment(p_tenancy_id uuid, p_adjustment_type text, p_amount numeric, p_effective_date date, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare tenancy_row public.rental_tenancies%rowtype; request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if p_adjustment_type not in ('debit', 'credit') or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_effective_date is null or length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'A valid adjustment type, amount, effective date and reason are required'; end if;
  select tenancy.* into tenancy_row from public.rental_tenancies tenancy where tenancy.id = p_tenancy_id for update;
  if not found or not exists (select 1 from public.rental_properties property where property.id = tenancy_row.property_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this tenancy'; end if;
  if public.rental_financial_period_is_closed(tenancy_row.id, p_effective_date) then raise exception 'The financial period is closed; reopen it before requesting a correction'; end if;
  insert into public.rental_financial_correction_requests(organisation_id, tenancy_id, correction_kind, adjustment_type, amount, effective_date, reason, requested_by) values (tenancy_row.organisation_id, tenancy_row.id, 'adjustment', p_adjustment_type, p_amount, p_effective_date, btrim(p_reason), auth.uid()) returning id into request_id;
  return jsonb_build_object('correction_id', request_id, 'status', 'pending');
end; $$;

create or replace function public.rental_request_payment_reversal(p_payment_id uuid, p_effective_date date, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payment_row public.rental_financial_payments%rowtype; request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if p_effective_date is null or length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'An effective date and reason are required'; end if;
  select payment.* into payment_row from public.rental_financial_payments payment where payment.id = p_payment_id for update;
  if not found or not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = payment_row.tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this payment'; end if;
  if public.rental_financial_period_is_closed(payment_row.tenancy_id, p_effective_date) then raise exception 'The financial period is closed; reopen it before requesting a reversal'; end if;
  insert into public.rental_financial_correction_requests(organisation_id, tenancy_id, correction_kind, adjustment_type, amount, effective_date, reason, original_payment_id, requested_by) values (payment_row.organisation_id, payment_row.tenancy_id, 'payment_reversal', 'debit', payment_row.amount, p_effective_date, btrim(p_reason), payment_row.id, auth.uid()) returning id into request_id;
  return jsonb_build_object('correction_id', request_id, 'status', 'pending', 'amount', payment_row.amount);
end; $$;

create or replace function public.rental_request_adjustment_reversal(p_adjustment_id uuid, p_effective_date date, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare adjustment_row public.rental_financial_adjustments%rowtype; request_id uuid; inverse_type text;
begin
  if auth.uid() is null or p_effective_date is null or length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'An effective date and reason are required'; end if;
  select * into adjustment_row from public.rental_financial_adjustments where id = p_adjustment_id for update;
  if not found or not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = adjustment_row.tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this adjustment'; end if;
  if public.rental_financial_period_is_closed(adjustment_row.tenancy_id, p_effective_date) then raise exception 'The financial period is closed; reopen it before requesting a reversal'; end if;
  inverse_type := case when adjustment_row.adjustment_type = 'debit' then 'credit' else 'debit' end;
  insert into public.rental_financial_correction_requests(organisation_id, tenancy_id, correction_kind, adjustment_type, amount, effective_date, reason, original_adjustment_id, requested_by) values (adjustment_row.organisation_id, adjustment_row.tenancy_id, 'adjustment_reversal', inverse_type, adjustment_row.amount, p_effective_date, btrim(p_reason), adjustment_row.id, auth.uid()) returning id into request_id;
  return jsonb_build_object('correction_id', request_id, 'status', 'pending', 'amount', adjustment_row.amount);
end; $$;

create or replace function public.rental_approve_financial_correction(p_correction_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare request_row public.rental_financial_correction_requests%rowtype; adjustment_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select * into request_row from public.rental_financial_correction_requests where id = p_correction_id for update;
  if not found then raise exception 'Correction request not found'; end if;
  if request_row.status <> 'pending' then raise exception 'This correction request has already been resolved'; end if;
  if request_row.requested_by = auth.uid() then raise exception 'A different authorised manager must approve this correction'; end if;
  if not public.rental_financial_manager_authorized(request_row.organisation_id) then raise exception 'Manager approval is required'; end if;
  if public.rental_financial_period_is_closed(request_row.tenancy_id, request_row.effective_date) then raise exception 'The financial period is closed; reopen it before approval'; end if;
  insert into public.rental_financial_adjustments(organisation_id, tenancy_id, currency_code, adjustment_type, effective_date, amount, reason, reversal_of_adjustment_id, created_by, correction_request_id)
  values (request_row.organisation_id, request_row.tenancy_id, 'ZAR', request_row.adjustment_type, request_row.effective_date, request_row.amount, request_row.reason, case when request_row.correction_kind = 'adjustment_reversal' then request_row.original_adjustment_id else null end, auth.uid(), request_row.id)
  returning id into adjustment_id;
  update public.rental_financial_correction_requests set status = 'applied', approved_by = auth.uid(), approved_at = now(), applied_adjustment_id = adjustment_id where id = request_row.id;
  return jsonb_build_object('correction_id', request_row.id, 'status', 'applied', 'adjustment_id', adjustment_id, 'adjustment_type', request_row.adjustment_type, 'amount', request_row.amount);
end; $$;

create or replace function public.rental_set_financial_period_status(p_tenancy_id uuid, p_period_start date, p_period_end date, p_status text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare tenancy_row public.rental_tenancies%rowtype; period_id uuid;
begin
  if p_status not in ('closed', 'reopened') or p_period_start is null or p_period_end is null or p_period_end < p_period_start or length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'A valid period, status and reason are required'; end if;
  select tenancy.* into tenancy_row from public.rental_tenancies tenancy where tenancy.id = p_tenancy_id for update;
  if not found or not public.rental_financial_manager_authorized(tenancy_row.organisation_id) then raise exception 'Manager approval is required'; end if;
  insert into public.rental_financial_closed_periods(organisation_id, tenancy_id, period_start, period_end, status, reason, closed_by) values (tenancy_row.organisation_id, tenancy_row.id, p_period_start, p_period_end, p_status, btrim(p_reason), auth.uid()) on conflict (tenancy_id, period_start, period_end) do update set status = excluded.status, reason = excluded.reason, closed_by = excluded.closed_by, closed_at = now() returning id into period_id;
  return jsonb_build_object('period_id', period_id, 'status', p_status);
end; $$;

create or replace function public.rental_get_tenancy_financial_balances(p_tenancy_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = p_tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this tenancy'; end if;
  select jsonb_build_object(
    'charges', coalesce((select jsonb_agg(jsonb_build_object('id', charge.id, 'description', charge.description, 'due_date', charge.due_date, 'amount', charge.amount, 'allocated_amount', coalesce((select sum(allocation.amount) from public.rental_financial_allocations allocation where allocation.charge_id = charge.id), 0), 'outstanding_amount', charge.amount - coalesce((select sum(allocation.amount) from public.rental_financial_allocations allocation where allocation.charge_id = charge.id), 0)) order by charge.due_date nulls last, charge.created_at) from public.rental_financial_charges charge where charge.tenancy_id = p_tenancy_id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', payment.id, 'received_date', payment.received_date, 'payment_reference', payment.payment_reference, 'amount', payment.amount, 'allocated_amount', coalesce((select sum(allocation.amount) from public.rental_financial_allocations allocation where allocation.payment_id = payment.id), 0), 'unapplied_amount', payment.amount - coalesce((select sum(allocation.amount) from public.rental_financial_allocations allocation where allocation.payment_id = payment.id), 0)) order by payment.received_date desc, payment.created_at desc) from public.rental_financial_payments payment where payment.tenancy_id = p_tenancy_id), '[]'::jsonb),
    'adjustments', coalesce((select jsonb_agg(jsonb_build_object('id', adjustment.id, 'adjustment_type', adjustment.adjustment_type, 'effective_date', adjustment.effective_date, 'amount', adjustment.amount, 'reason', adjustment.reason, 'correction_request_id', adjustment.correction_request_id) order by adjustment.effective_date desc, adjustment.created_at desc) from public.rental_financial_adjustments adjustment where adjustment.tenancy_id = p_tenancy_id), '[]'::jsonb),
    'summary', jsonb_build_object('charge_total', coalesce((select sum(amount) from public.rental_financial_charges where tenancy_id = p_tenancy_id), 0), 'allocated_total', coalesce((select sum(amount) from public.rental_financial_allocations where tenancy_id = p_tenancy_id), 0), 'debit_adjustment_total', coalesce((select sum(amount) from public.rental_financial_adjustments where tenancy_id = p_tenancy_id and adjustment_type = 'debit'), 0), 'credit_adjustment_total', coalesce((select sum(amount) from public.rental_financial_adjustments where tenancy_id = p_tenancy_id and adjustment_type = 'credit'), 0), 'net_outstanding_amount', coalesce((select sum(amount) from public.rental_financial_charges where tenancy_id = p_tenancy_id), 0) - coalesce((select sum(amount) from public.rental_financial_allocations where tenancy_id = p_tenancy_id), 0) + coalesce((select sum(amount) from public.rental_financial_adjustments where tenancy_id = p_tenancy_id and adjustment_type = 'debit'), 0) - coalesce((select sum(amount) from public.rental_financial_adjustments where tenancy_id = p_tenancy_id and adjustment_type = 'credit'), 0))
  ) into result;
  return result;
end; $$;

revoke all on function public.rental_financial_manager_authorized(uuid), public.rental_financial_period_is_closed(uuid, date) from public, anon, authenticated;
revoke execute on function public.rental_request_financial_adjustment(uuid, text, numeric, date, text), public.rental_request_payment_reversal(uuid, date, text), public.rental_request_adjustment_reversal(uuid, date, text), public.rental_approve_financial_correction(uuid), public.rental_set_financial_period_status(uuid, date, date, text, text), public.rental_get_tenancy_financial_balances(uuid) from public, anon;
grant execute on function public.rental_request_financial_adjustment(uuid, text, numeric, date, text), public.rental_request_payment_reversal(uuid, date, text), public.rental_request_adjustment_reversal(uuid, date, text), public.rental_approve_financial_correction(uuid), public.rental_set_financial_period_status(uuid, date, date, text, text), public.rental_get_tenancy_financial_balances(uuid) to authenticated;
commit;
