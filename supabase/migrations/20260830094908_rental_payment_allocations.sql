-- Rentals Phase 39: atomic append-only allocation and balance projection.
begin;
create or replace function public.rental_allocate_payment(p_payment_id uuid, p_allocations jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payment_row public.rental_financial_payments%rowtype; charge_row public.rental_financial_charges%rowtype; item jsonb; remaining numeric(14,2); requested numeric(14,2); outstanding numeric(14,2); applied numeric(14,2); inserted_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select payment.* into payment_row from public.rental_financial_payments payment where payment.id=p_payment_id for update;
  if not found or not exists(select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id=tenancy.property_id where tenancy.id=payment_row.tenancy_id and public.rental_branch_access(property.organisation_id,property.branch_id)) then raise exception 'You are not authorized for this payment'; end if;
  select coalesce(sum(amount),0) into applied from public.rental_financial_allocations where payment_id=payment_row.id;
  remaining := payment_row.amount - applied;
  if remaining <= 0 then return jsonb_build_object('payment_id',payment_row.id,'allocated_amount',applied,'unapplied_amount',0,'idempotent',true); end if;
  if jsonb_typeof(p_allocations) <> 'array' then raise exception 'Allocations must be an array'; end if;
  if jsonb_array_length(p_allocations)=0 then
    for charge_row in select charge.* from public.rental_financial_charges charge where charge.tenancy_id=payment_row.tenancy_id order by charge.due_date nulls last, charge.created_at for update loop
      select coalesce(sum(amount),0) into applied from public.rental_financial_allocations where charge_id=charge_row.id;
      outstanding:=charge_row.amount-applied; if outstanding<=0 then continue; end if; requested:=least(remaining,outstanding);
      insert into public.rental_financial_allocations(organisation_id,tenancy_id,payment_id,charge_id,amount,created_by) values(payment_row.organisation_id,payment_row.tenancy_id,payment_row.id,charge_row.id,requested,auth.uid()); remaining:=remaining-requested; inserted_count:=inserted_count+1; if remaining=0 then exit; end if;
    end loop;
  else
    for item in select value from jsonb_array_elements(p_allocations) loop
      requested:=nullif(item->>'amount','')::numeric; if requested is null or requested<=0 or requested<>round(requested,2) then raise exception 'Allocation amount must be positive and two-decimal'; end if;
      if requested>remaining then raise exception 'Allocation exceeds unapplied payment balance'; end if;
      select charge.* into charge_row from public.rental_financial_charges charge where charge.id=(item->>'charge_id')::uuid and charge.tenancy_id=payment_row.tenancy_id for update;
      if not found then raise exception 'Allocation charge does not belong to this tenancy'; end if;
      select coalesce(sum(amount),0) into applied from public.rental_financial_allocations where charge_id=charge_row.id;
      outstanding:=charge_row.amount-applied; if requested>outstanding then raise exception 'Allocation exceeds charge outstanding balance'; end if;
      insert into public.rental_financial_allocations(organisation_id,tenancy_id,payment_id,charge_id,amount,created_by) values(payment_row.organisation_id,payment_row.tenancy_id,payment_row.id,charge_row.id,requested,auth.uid()); remaining:=remaining-requested; inserted_count:=inserted_count+1;
    end loop;
  end if;
  return jsonb_build_object('payment_id',payment_row.id,'allocation_count',inserted_count,'allocated_amount',payment_row.amount-remaining,'unapplied_amount',remaining,'idempotent',false);
end; $$;
create or replace function public.rental_get_tenancy_financial_balances(p_tenancy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication is required'; end if;
 if not exists(select 1 from public.rental_tenancies tenancy join public.rental_properties property on property.id=tenancy.property_id where tenancy.id=p_tenancy_id and public.rental_branch_access(property.organisation_id,property.branch_id)) then raise exception 'You are not authorized for this tenancy'; end if;
 select jsonb_build_object('charges',coalesce((select jsonb_agg(jsonb_build_object('id',charge.id,'description',charge.description,'amount',charge.amount,'allocated_amount',coalesce((select sum(allocation.amount) from public.rental_financial_allocations allocation where allocation.charge_id=charge.id),0),'outstanding_amount',charge.amount-coalesce((select sum(allocation.amount) from public.rental_financial_allocations allocation where allocation.charge_id=charge.id),0)) order by charge.due_date) from public.rental_financial_charges charge where charge.tenancy_id=p_tenancy_id),'[]'::jsonb),'payments',coalesce((select jsonb_agg(jsonb_build_object('id',payment.id,'reference',payment.payment_reference,'amount',payment.amount,'allocated_amount',coalesce((select sum(allocation.amount) from public.rental_financial_allocations allocation where allocation.payment_id=payment.id),0),'unapplied_amount',payment.amount-coalesce((select sum(allocation.amount) from public.rental_financial_allocations allocation where allocation.payment_id=payment.id),0)) order by payment.received_date desc) from public.rental_financial_payments payment where payment.tenancy_id=p_tenancy_id),'[]'::jsonb)) into result; return result;
end; $$;
revoke execute on function public.rental_allocate_payment(uuid,jsonb) from public,anon; revoke execute on function public.rental_get_tenancy_financial_balances(uuid) from public,anon;
grant execute on function public.rental_allocate_payment(uuid,jsonb) to authenticated;
grant execute on function public.rental_get_tenancy_financial_balances(uuid) to authenticated;
commit;
