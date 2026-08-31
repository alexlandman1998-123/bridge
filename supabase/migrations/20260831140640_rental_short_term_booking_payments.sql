-- Phase 7: manual Short-Term booking receipts. Gateway and bank-feed ingestion
-- are intentionally deferred; records are append-first and reversible.
create table public.rental_short_term_booking_payments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  unit_id uuid not null references public.rental_units(id) on delete cascade,
  booking_id uuid not null references public.rental_short_term_bookings(id) on delete restrict,
  status text not null default 'captured' check (status in ('captured', 'reversed')),
  amount numeric(12,2) not null check (amount > 0),
  currency_code text not null check (currency_code = upper(currency_code) and length(currency_code) = 3),
  payment_method text not null check (payment_method in ('eft', 'card', 'cash', 'other')),
  paid_at timestamptz not null default now(),
  reference text,
  notes text,
  reversed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'captured' and reversed_at is null) or (status = 'reversed' and reversed_at is not null))
);
create index rental_short_term_booking_payments_booking_status_idx on public.rental_short_term_booking_payments (booking_id, status);
create index rental_short_term_booking_payments_org_paid_idx on public.rental_short_term_booking_payments (organisation_id, paid_at desc);
create index rental_short_term_booking_payments_branch_id_idx on public.rental_short_term_booking_payments (branch_id);
create index rental_short_term_booking_payments_property_id_idx on public.rental_short_term_booking_payments (property_id);
create index rental_short_term_booking_payments_unit_id_idx on public.rental_short_term_booking_payments (unit_id);
create index rental_short_term_booking_payments_created_by_idx on public.rental_short_term_booking_payments (created_by);
create or replace function public.rental_short_term_booking_payment_validate_scope() returns trigger language plpgsql set search_path=public as $$ declare v_booking record; begin select organisation_id,branch_id,property_id,unit_id,currency_code into v_booking from public.rental_short_term_bookings where id=new.booking_id; if not found then raise exception 'Short-Term booking does not exist';end if; if new.organisation_id is distinct from v_booking.organisation_id or new.branch_id is distinct from v_booking.branch_id or new.property_id is distinct from v_booking.property_id or new.unit_id is distinct from v_booking.unit_id then raise exception 'Short-Term payment scope must match its booking';end if; if v_booking.currency_code is not null and new.currency_code is distinct from v_booking.currency_code then raise exception 'Short-Term payment currency must match its booking';end if; if new.status='reversed' and(new.reversed_at is null) then new.reversed_at:=now(); elsif new.status='captured' then new.reversed_at:=null;end if; return new;end; $$;
create trigger rental_short_term_booking_payments_validate_scope before insert or update on public.rental_short_term_booking_payments for each row execute function public.rental_short_term_booking_payment_validate_scope();
create trigger rental_short_term_booking_payments_set_updated_at before update on public.rental_short_term_booking_payments for each row execute function public.rental_set_updated_at();
alter table public.rental_short_term_booking_payments enable row level security; revoke all on public.rental_short_term_booking_payments from anon; grant select,insert,update on public.rental_short_term_booking_payments to authenticated;
create policy rental_short_term_booking_payments_select_scoped on public.rental_short_term_booking_payments for select to authenticated using(exists(select 1 from public.rental_properties property where property.id=rental_short_term_booking_payments.property_id and public.rental_branch_access(property.organisation_id,property.branch_id)));
create policy rental_short_term_booking_payments_insert_scoped on public.rental_short_term_booking_payments for insert to authenticated with check(exists(select 1 from public.rental_properties property where property.id=rental_short_term_booking_payments.property_id and public.rental_branch_access(property.organisation_id,property.branch_id) and(public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id=(select auth.uid()) or property.created_by=(select auth.uid()))));
create policy rental_short_term_booking_payments_update_scoped on public.rental_short_term_booking_payments for update to authenticated using(exists(select 1 from public.rental_properties property where property.id=rental_short_term_booking_payments.property_id and public.rental_branch_access(property.organisation_id,property.branch_id) and(public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id=(select auth.uid()) or property.created_by=(select auth.uid())))) with check(exists(select 1 from public.rental_properties property where property.id=rental_short_term_booking_payments.property_id and public.rental_branch_access(property.organisation_id,property.branch_id) and(public.bridge_is_org_admin(property.organisation_id) or property.assigned_manager_id=(select auth.uid()) or property.created_by=(select auth.uid()))));
