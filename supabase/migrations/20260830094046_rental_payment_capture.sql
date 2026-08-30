-- Rentals Phase 38: controlled payment capture. Allocation is intentionally deferred to Phase 39.
begin;
create table public.rental_payment_capture_events (
  id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.rental_financial_payments(id) on delete restrict,
  tenancy_id uuid not null references public.rental_tenancies(id) on delete restrict, organisation_id uuid not null references public.organisations(id) on delete restrict,
  event_type text not null default 'payment_recorded' check (event_type = 'payment_recorded'), evidence_json jsonb not null default '{}'::jsonb,
  occurred_by uuid not null references auth.users(id) on delete restrict, occurred_at timestamptz not null default now()
);
create index rental_payment_capture_events_tenancy_idx on public.rental_payment_capture_events(tenancy_id, occurred_at desc);
alter table public.rental_payment_capture_events enable row level security;
revoke all on public.rental_payment_capture_events from anon, authenticated;
grant select on public.rental_payment_capture_events to authenticated;
create policy rental_payment_capture_events_staff_read on public.rental_payment_capture_events for select to authenticated using (exists (select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id = tenancy.property_id where tenancy.id = tenancy_id and public.rental_branch_access(property.organisation_id, property.branch_id)));

create or replace function public.rental_record_payment(p_tenancy_id uuid, p_amount numeric, p_received_date date, p_payment_reference text, p_payment_method text, p_evidence_link text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare tenancy_row public.rental_tenancies%rowtype; payment_row public.rental_financial_payments%rowtype; payment_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'Payment amount must be a positive two-decimal amount'; end if;
  if p_received_date is null or p_received_date > current_date then raise exception 'A valid received date is required'; end if;
  if length(btrim(coalesce(p_payment_reference, ''))) = 0 then raise exception 'Payment reference is required'; end if;
  if p_payment_method not in ('bank_transfer', 'cash', 'card', 'other') then raise exception 'Payment method is invalid'; end if;
  if length(btrim(coalesce(p_evidence_link, ''))) = 0 then raise exception 'Payment evidence link is required'; end if;
  select tenancy.* into tenancy_row from public.rental_tenancies tenancy where tenancy.id = p_tenancy_id for update;
  if not found or not exists (select 1 from public.rental_properties property where property.id = tenancy_row.property_id and public.rental_branch_access(property.organisation_id, property.branch_id)) then raise exception 'You are not authorized for this tenancy'; end if;
  if tenancy_row.status <> 'active' then raise exception 'Payments can only be recorded for an active tenancy'; end if;
  select payment.* into payment_row from public.rental_financial_payments payment where payment.organisation_id = tenancy_row.organisation_id and payment.payment_reference = btrim(p_payment_reference) for update;
  if found then
    if payment_row.tenancy_id = tenancy_row.id and payment_row.amount = p_amount and payment_row.received_date = p_received_date and payment_row.payment_method = p_payment_method and payment_row.evidence_link = btrim(p_evidence_link) then return jsonb_build_object('payment_id', payment_row.id, 'idempotent', true, 'unapplied_amount', payment_row.amount); end if;
    raise exception 'This payment reference already belongs to a different payment';
  end if;
  insert into public.rental_financial_payments(organisation_id, tenancy_id, currency_code, received_date, amount, payment_reference, payment_method, evidence_link, created_by)
  values (tenancy_row.organisation_id, tenancy_row.id, 'ZAR', p_received_date, p_amount, btrim(p_payment_reference), p_payment_method, btrim(p_evidence_link), auth.uid()) returning id into payment_id;
  insert into public.rental_payment_capture_events(payment_id, tenancy_id, organisation_id, evidence_json, occurred_by) values (payment_id, tenancy_row.id, tenancy_row.organisation_id, jsonb_build_object('payment_reference', btrim(p_payment_reference), 'payment_method', p_payment_method, 'evidence_link', btrim(p_evidence_link)), auth.uid());
  return jsonb_build_object('payment_id', payment_id, 'idempotent', false, 'unapplied_amount', p_amount);
end; $$;
revoke execute on function public.rental_record_payment(uuid, numeric, date, text, text, text) from public, anon;
grant execute on function public.rental_record_payment(uuid, numeric, date, text, text, text) to authenticated;
commit;
