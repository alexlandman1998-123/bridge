begin;

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'commercial_commission_status') then
    create type public.commercial_commission_status as enum (
      'projected',
      'approved',
      'paid'
    );
  end if;
end
$$;

create table if not exists public.commercial_commissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  team_id uuid references public.commercial_teams(id) on delete set null,
  transaction_id uuid not null references public.commercial_transactions(id) on delete cascade,
  broker_id uuid not null references auth.users(id) on delete restrict,
  commission_percent numeric not null default 5,
  commission_amount numeric not null default 0,
  status public.commercial_commission_status not null default 'projected',
  manual_override boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create unique index if not exists commercial_commissions_transaction_unique_idx
  on public.commercial_commissions (transaction_id);

create index if not exists commercial_commissions_organisation_idx
  on public.commercial_commissions (organisation_id);

create index if not exists commercial_commissions_hierarchy_idx
  on public.commercial_commissions (organisation_id, branch_id, team_id, broker_id);

create index if not exists commercial_commissions_status_idx
  on public.commercial_commissions (organisation_id, status);

create index if not exists commercial_commissions_broker_idx
  on public.commercial_commissions (broker_id, status);

drop trigger if exists trg_bridge_touch_commercial_commissions_updated_at on public.commercial_commissions;
create trigger trg_bridge_touch_commercial_commissions_updated_at
before update on public.commercial_commissions
for each row execute function public.bridge_touch_commercial_updated_at();

alter table public.commercial_commissions enable row level security;

drop policy if exists commercial_commissions_brokerage_access on public.commercial_commissions;
create policy commercial_commissions_brokerage_access on public.commercial_commissions
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

grant select, insert, update, delete on public.commercial_commissions to authenticated;

insert into public.commercial_commissions (
  organisation_id,
  branch_id,
  team_id,
  transaction_id,
  broker_id,
  commission_percent,
  commission_amount,
  status,
  manual_override,
  created_by,
  created_at,
  updated_at,
  updated_by
)
select
  tx.organisation_id,
  tx.branch_id,
  tx.team_id,
  tx.id,
  tx.broker_id,
  case
    when base_value > 0 and coalesce(deal.estimated_commission, 0) > 0 then round((deal.estimated_commission / base_value) * 100, 4)
    else 5
  end as commission_percent,
  case
    when coalesce(deal.estimated_commission, 0) > 0 then round(deal.estimated_commission, 2)
    else round(base_value * 0.05, 2)
  end as commission_amount,
  case
    when lower(coalesce(tx.status::text, 'draft')) = 'completed' then 'approved'::public.commercial_commission_status
    else 'projected'::public.commercial_commission_status
  end as status,
  false as manual_override,
  tx.created_by,
  coalesce(tx.created_at, now()),
  coalesce(tx.updated_at, tx.created_at, now()),
  tx.updated_by
from public.commercial_transactions tx
left join public.commercial_deals deal
  on deal.id = tx.deal_id
left join public.commercial_heads_of_terms hot
  on hot.deal_id = tx.deal_id
left join public.commercial_leases lease
  on lease.deal_id = tx.deal_id
cross join lateral (
  select greatest(
    case
      when tx.transaction_type = 'sale'::public.commercial_transaction_type then coalesce(tx.target_value, deal.deal_value, 0)
      else coalesce(
        lease.monthly_rental * greatest(coalesce(lease.lease_term_months, hot.lease_term_months, 12), 1),
        hot.monthly_rental * greatest(coalesce(hot.lease_term_months, lease.lease_term_months, 12), 1),
        tx.target_value,
        deal.deal_value,
        0
      )
    end,
    0
  ) as base_value
) calc
where tx.id is not null
  and tx.broker_id is not null
on conflict (transaction_id) do nothing;

commit;
