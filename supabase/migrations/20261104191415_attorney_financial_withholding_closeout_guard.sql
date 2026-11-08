-- Financial and legal closure share the same seller-specific remittance rule.
-- Future writes only: existing financial and transaction records are untouched.
create function journey_private.guard_attorney_financial_withholding_closeout()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_reviews jsonb; v_review jsonb;
begin
 if new.close_out_status is distinct from 'closed' then return new; end if;
 select routing_profile_json #> '{transferTaxDecision,nonResidentSellers}' into v_reviews
 from public.transactions where id=new.transaction_id;
 for v_review in select value from pg_catalog.jsonb_each(coalesce(v_reviews,'{}'::jsonb)) loop
   perform journey_private.assert_attorney_withholding_remittance(v_review,true);
 end loop;
 return new;
end;
$$;
revoke all on function journey_private.guard_attorney_financial_withholding_closeout() from public,anon,authenticated;
create trigger guard_attorney_financial_withholding_closeout before insert or update on public.transaction_attorney_closeouts
for each row execute function journey_private.guard_attorney_financial_withholding_closeout();
