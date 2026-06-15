create table if not exists public.transaction_lifecycle_workflows (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  current_stage text not null,
  status text not null default 'active',
  last_updated_by uuid null references public.profiles(id) on delete set null,
  last_updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_lifecycle_workflows_stage_check
    check (current_stage in ('confirmed', 'otp', 'finance', 'transfer', 'registration')),
  constraint transaction_lifecycle_workflows_status_check
    check (status in ('active', 'completed', 'blocked'))
);
create unique index if not exists transaction_lifecycle_workflows_transaction_uidx
  on public.transaction_lifecycle_workflows (transaction_id);
insert into public.transaction_lifecycle_workflows (
  transaction_id,
  current_stage,
  status,
  completed_at,
  last_updated_at,
  created_at,
  updated_at
)
select
  t.id,
  case
    when lower(coalesce(t.lifecycle_state, '')) in ('completed', 'registered')
      or lower(coalesce(t.current_main_stage, '')) in ('reg', 'registration', 'registered')
      or lower(coalesce(t.stage, '')) ~ '(registered|registration|lodged|lodgement)'
      then 'registration'
    when lower(coalesce(t.current_main_stage, '')) in ('atty', 'attorney', 'xfer', 'transfer')
      or lower(coalesce(t.stage, '')) ~ '(attorney|transfer|instruction|fica|draft|sign|guarantee)'
      or nullif(t.attorney_stage, '') is not null
      then 'transfer'
    when lower(coalesce(t.current_main_stage, '')) in ('fin', 'finance')
      or lower(coalesce(t.stage, '')) ~ '(finance|bond|cash|fund|application|quote|approval)'
      then 'finance'
    when lower(coalesce(t.current_main_stage, '')) in ('otp')
      or lower(coalesce(t.stage, '')) ~ '(otp|offer|purchase agreement|sale agreement)'
      then 'otp'
    else 'confirmed'
  end,
  case
    when lower(coalesce(t.lifecycle_state, '')) = 'completed' then 'completed'
    else 'active'
  end,
  case
    when lower(coalesce(t.lifecycle_state, '')) = 'completed' then coalesce(t.completed_at, t.registered_at, t.updated_at, now())
    else null
  end,
  coalesce(t.updated_at, now()),
  now(),
  now()
from public.transactions t
where t.id is not null
on conflict (transaction_id) do nothing;
comment on table public.transaction_lifecycle_workflows is
  'Canonical parent transaction lifecycle: Confirmed, OTP, Finance, Transfer, Registration. Module workflows store detailed sub-statuses separately.';
