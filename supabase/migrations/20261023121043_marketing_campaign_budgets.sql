begin;
-- Planning only: actual spend remains owned by future channel integrations.
alter table public.marketing_campaigns
  add column planned_budget numeric(12,2),
  add column budget_currency text not null default 'ZAR',
  add constraint marketing_campaign_budget_valid check (planned_budget is null or (planned_budget >= 0 and planned_budget <= 9999999999.99)),
  add constraint marketing_campaign_budget_currency_valid check (budget_currency = 'ZAR');
grant insert(planned_budget,budget_currency), update(planned_budget,budget_currency)
  on public.marketing_campaigns to authenticated;
-- Existing organisation/creator RLS and revision checks continue to govern writes.
commit;
