begin;

alter table if exists public.commission_targets
  add column if not exists target_metric text;

update public.commission_targets
set target_metric = case
  when target_type = 'agent' then 'agent_commission'
  else 'company_commission'
end
where target_metric is null;

alter table if exists public.commission_targets
  alter column target_metric set default 'company_commission',
  alter column target_metric set not null;

alter table if exists public.commission_targets
  drop constraint if exists commission_targets_period_check;

alter table if exists public.commission_targets
  add constraint commission_targets_period_check
  check (period in ('monthly', 'quarterly', 'yearly'));

alter table if exists public.commission_targets
  drop constraint if exists commission_targets_target_metric_check;

alter table if exists public.commission_targets
  add constraint commission_targets_target_metric_check
  check (target_metric in ('company_commission', 'agent_commission', 'gross_commission'));

create index if not exists commission_targets_org_metric_active_idx
  on public.commission_targets (organisation_id, target_type, target_metric, period, is_active, start_month desc);

drop index if exists public.commission_targets_active_company_unique_idx;
create unique index if not exists commission_targets_active_company_metric_unique_idx
  on public.commission_targets (organisation_id, target_type, target_metric)
  where target_type = 'company' and is_active = true;

drop index if exists public.commission_targets_active_branch_unique_idx;
create unique index if not exists commission_targets_active_branch_metric_unique_idx
  on public.commission_targets (organisation_id, branch_id, target_type, target_metric)
  where target_type = 'branch' and is_active = true;

drop index if exists public.commission_targets_active_agent_unique_idx;
create unique index if not exists commission_targets_active_agent_metric_unique_idx
  on public.commission_targets (organisation_id, user_id, target_type, target_metric)
  where target_type = 'agent' and is_active = true;

comment on column public.commission_targets.target_metric is
  'Metric tracked by this commission target: company_commission, agent_commission, or gross_commission.';

comment on column public.commission_targets.period is
  'Target cadence: monthly, quarterly, or yearly.';

commit;
