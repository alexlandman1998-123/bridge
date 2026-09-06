begin;
create or replace function public.rental_allocate_payment(p_payment_id uuid, p_allocations jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.rental_financial_payments%rowtype;
  charge_row public.rental_financial_charges%rowtype;
  allocation_item jsonb;
  remaining_amount numeric(14,2);
  requested_amount numeric(14,2);
  outstanding_amount numeric(14,2);
  total_allocated numeric(14,2) := 0;
begin
  select * into payment_row from public.rental_financial_payments where id = p_payment_id and organization_id = public.current_organization_id() for update;
  if not found then raise exception 'Payment not found'; end if;
  select coalesce(payment_row.amount - sum(allocation.amount), payment_row.amount) into remaining_amount from public.rental_financial_allocations allocation where allocation.payment_id = payment_row.id;
  if remaining_amount <= 0 then return jsonb_build_object('payment_id', payment_row.id, 'allocated_amount', 0, 'unapplied_amount', 0); end if;
  if jsonb_typeof(p_allocations) <> 'array' then raise exception 'Allocations must be an array'; end if;
  if jsonb_array_length(p_allocations) = 0 then
    for charge_row in select * from public.rental_financial_charges where tenancy_id = payment_row.tenancy_id and organization_id = payment_row.organization_id order by due_date, created_at, id for update loop
      select charge_row.amount - coalesce(sum(allocation.amount), 0) into outstanding_amount from public.rental_financial_allocations allocation where allocation.charge_id = charge_row.id;
      requested_amount := least(remaining_amount, greatest(outstanding_amount, 0));
      if requested_amount > 0 then
        insert into public.rental_financial_allocations (organization_id, tenancy_id, payment_id, charge_id, amount, allocated_at) values (payment_row.organization_id, payment_row.tenancy_id, payment_row.id, charge_row.id, requested_amount, now());
        remaining_amount := remaining_amount - requested_amount;
        total_allocated := total_allocated + requested_amount;
      end if;
      exit when remaining_amount <= 0;
    end loop;
  else
    for allocation_item in select value from jsonb_array_elements(p_allocations) loop
      requested_amount := nullif(allocation_item ->> 'amount', '')::numeric;
      if requested_amount is null or requested_amount <= 0 then raise exception 'Each allocation needs a positive amount'; end if;
      if requested_amount > remaining_amount then raise exception 'Allocation exceeds unapplied payment'; end if;
      select * into charge_row from public.rental_financial_charges where id = (allocation_item ->> 'charge_id')::uuid and tenancy_id = payment_row.tenancy_id and organization_id = payment_row.organization_id for update;
      if not found then raise exception 'Charge not found for this tenancy'; end if;
      select charge_row.amount - coalesce(sum(allocation.amount), 0) into outstanding_amount from public.rental_financial_allocations allocation where allocation.charge_id = charge_row.id;
      if requested_amount > outstanding_amount then raise exception 'Allocation exceeds charge balance'; end if;
      insert into public.rental_financial_allocations (organization_id, tenancy_id, payment_id, charge_id, amount, allocated_at) values (payment_row.organization_id, payment_row.tenancy_id, payment_row.id, charge_row.id, requested_amount, now());
      remaining_amount := remaining_amount - requested_amount;
      total_allocated := total_allocated + requested_amount;
    end loop;
  end if;
  return jsonb_build_object('payment_id', payment_row.id, 'allocated_amount', total_allocated, 'unapplied_amount', remaining_amount);
end;
$$;
grant execute on function public.rental_allocate_payment(uuid, jsonb) to authenticated;
revoke all on function public.rental_allocate_payment(uuid, jsonb) from public, anon;
commit;;
