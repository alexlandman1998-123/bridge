-- When one active plan covers a booking's unit and check-in date, capture it
-- automatically. Explicit plan selection remains supported for future UI work.
create or replace function public.rental_short_term_booking_apply_rate_plan()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_plan public.rental_short_term_rate_plans%rowtype;
  v_nights integer;
begin
  if new.rate_plan_id is null then
    select * into v_plan
      from public.rental_short_term_rate_plans
     where unit_id = new.unit_id
       and organisation_id = new.organisation_id
       and property_id = new.property_id
       and branch_id is not distinct from new.branch_id
       and status = 'active'
       and effective_from <= new.check_in_at::date
       and (effective_to is null or effective_to > new.check_in_at::date)
     order by effective_from desc
     limit 1;
    if not found then
      new.currency_code := null;
      new.nightly_rate := null;
      new.cleaning_fee := null;
      new.total_amount := null;
      return new;
    end if;
    new.rate_plan_id := v_plan.id;
  else
    select * into v_plan from public.rental_short_term_rate_plans where id = new.rate_plan_id;
    if not found or v_plan.status <> 'active' then raise exception 'Select an active Short-Term rate plan'; end if;
    if v_plan.organisation_id is distinct from new.organisation_id or v_plan.property_id is distinct from new.property_id or v_plan.unit_id is distinct from new.unit_id or v_plan.branch_id is distinct from new.branch_id then raise exception 'Short-Term rate plan scope must match its booking'; end if;
    if new.check_in_at::date < v_plan.effective_from or (v_plan.effective_to is not null and new.check_in_at::date >= v_plan.effective_to) then raise exception 'Short-Term rate plan is not effective for this check-in date'; end if;
  end if;

  v_nights := greatest(1, ceil(extract(epoch from (new.check_out_at - new.check_in_at)) / 86400.0)::integer);
  if v_nights < v_plan.minimum_nights then raise exception 'This rate plan requires a minimum stay of % nights', v_plan.minimum_nights; end if;
  new.currency_code := v_plan.currency_code;
  new.nightly_rate := v_plan.nightly_rate;
  new.cleaning_fee := v_plan.cleaning_fee;
  new.total_amount := (v_plan.nightly_rate * v_nights) + v_plan.cleaning_fee;
  return new;
end;
$$;
