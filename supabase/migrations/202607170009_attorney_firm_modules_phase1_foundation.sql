begin;

create extension if not exists "pgcrypto";

create table if not exists public.attorney_firm_modules (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  module_key text not null,
  status text not null default 'active',
  activated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_firm_modules_firm_module_unique unique (firm_id, module_key),
  constraint attorney_firm_modules_module_key_check
    check (module_key in ('transfer', 'bond', 'cancellation')),
  constraint attorney_firm_modules_status_check
    check (status in ('active', 'winding_down', 'inactive')),
  constraint attorney_firm_modules_status_timestamps_check
    check (
      (status = 'inactive' and deactivated_at is not null)
      or (status in ('active', 'winding_down') and deactivated_at is null)
    )
);

create index if not exists attorney_firm_modules_firm_status_idx
  on public.attorney_firm_modules (firm_id, status, module_key);

comment on table public.attorney_firm_modules is
  'Canonical service catalogue for attorney firms. Modules are independent from organisational departments and individual permissions.';

comment on column public.attorney_firm_modules.status is
  'active accepts new and existing work; winding_down blocks new work but keeps existing work operational; inactive is historical-only.';

create or replace function public.seed_default_attorney_firm_modules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.attorney_firm_modules (
    firm_id,
    module_key,
    status,
    activated_at,
    deactivated_at,
    changed_by
  )
  values
    (new.id, 'transfer', 'active', now(), null, new.created_by),
    (new.id, 'bond', 'active', now(), null, new.created_by),
    (new.id, 'cancellation', 'active', now(), null, new.created_by)
  on conflict (firm_id, module_key) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_attorney_firms_seed_modules on public.attorney_firms;
create trigger trg_attorney_firms_seed_modules
after insert on public.attorney_firms
for each row
execute function public.seed_default_attorney_firm_modules();

-- Preserve current behaviour for every existing firm during the phased rollout.
insert into public.attorney_firm_modules (
  firm_id,
  module_key,
  status,
  activated_at,
  deactivated_at,
  changed_by
)
select
  firm.id,
  module.module_key,
  'active',
  coalesce(firm.created_at, now()),
  null,
  firm.created_by
from public.attorney_firms firm
cross join (
  values ('transfer'), ('bond'), ('cancellation')
) as module(module_key)
on conflict (firm_id, module_key) do nothing;

drop trigger if exists trg_attorney_firm_modules_updated_at on public.attorney_firm_modules;
create trigger trg_attorney_firm_modules_updated_at
before update on public.attorney_firm_modules
for each row
execute function public.set_updated_at_timestamp();

alter table public.attorney_firm_modules enable row level security;

drop policy if exists attorney_firm_modules_select_member on public.attorney_firm_modules;
create policy attorney_firm_modules_select_member
  on public.attorney_firm_modules
  for select
  to authenticated
  using (
    public.attorney_user_is_active_member(firm_id)
    or exists (
      select 1
      from public.attorney_firms firm
      where firm.id = firm_id
        and firm.created_by = auth.uid()
    )
  );

-- Status mutations intentionally go through set_attorney_firm_module_status so
-- transition rules cannot be bypassed by ordinary authenticated clients.
grant select on public.attorney_firm_modules to authenticated;

create or replace function public.get_attorney_firm_modules(
  p_firm_id uuid
)
returns setof public.attorney_firm_modules
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_firm_id is null then
    raise exception 'Attorney firm is required.' using errcode = '22023';
  end if;
  if not (
    public.attorney_user_is_active_member(p_firm_id)
    or exists (
      select 1
      from public.attorney_firms firm
      where firm.id = p_firm_id
        and firm.created_by = auth.uid()
    )
  ) then
    raise exception 'You do not have access to this attorney firm.' using errcode = '42501';
  end if;

  return query
  select module.*
  from public.attorney_firm_modules module
  where module.firm_id = p_firm_id
  order by case module.module_key
    when 'transfer' then 1
    when 'bond' then 2
    else 3
  end;
end;
$$;

create or replace function public.set_attorney_firm_module_status(
  p_firm_id uuid,
  p_module_key text,
  p_status text
)
returns public.attorney_firm_modules
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_module_key text := lower(btrim(coalesce(p_module_key, '')));
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_remaining_operational integer;
  v_result public.attorney_firm_modules;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_firm_id is null then
    raise exception 'Attorney firm is required.' using errcode = '22023';
  end if;
  if v_module_key not in ('transfer', 'bond', 'cancellation') then
    raise exception 'Unsupported attorney module: %', coalesce(nullif(v_module_key, ''), '(blank)') using errcode = '22023';
  end if;
  if v_status not in ('active', 'winding_down', 'inactive') then
    raise exception 'Unsupported attorney module status: %', coalesce(nullif(v_status, ''), '(blank)') using errcode = '22023';
  end if;
  if not (
    public.attorney_user_is_firm_admin(p_firm_id)
    or exists (
      select 1
      from public.attorney_firms firm
      where firm.id = p_firm_id
        and firm.created_by = auth.uid()
    )
  ) then
    raise exception 'Only a firm administrator can change attorney modules.' using errcode = '42501';
  end if;

  insert into public.attorney_firm_modules (
    firm_id,
    module_key,
    status,
    activated_at,
    deactivated_at,
    changed_by
  )
  select
    p_firm_id,
    module.module_key,
    'active',
    now(),
    null,
    auth.uid()
  from (values ('transfer'), ('bond'), ('cancellation')) as module(module_key)
  on conflict (firm_id, module_key) do nothing;

  if v_status = 'inactive' then
    select count(*)
    into v_remaining_operational
    from public.attorney_firm_modules module
    where module.firm_id = p_firm_id
      and module.module_key <> v_module_key
      and module.status in ('active', 'winding_down');

    if v_remaining_operational = 0 then
      raise exception 'An attorney firm must retain at least one operational module.' using errcode = '23514';
    end if;
  end if;

  update public.attorney_firm_modules module
  set
    status = v_status,
    activated_at = case
      when v_status = 'active' and module.status <> 'active' then now()
      else module.activated_at
    end,
    deactivated_at = case
      when v_status = 'inactive' then now()
      else null
    end,
    changed_by = auth.uid()
  where module.firm_id = p_firm_id
    and module.module_key = v_module_key
  returning module.* into v_result;

  return v_result;
end;
$$;

create or replace function public.attorney_firm_module_accepts_new_work(
  p_firm_id uuid,
  p_module_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_module_key text := lower(btrim(coalesce(p_module_key, '')));
  v_accepts_new_work boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_firm_id is null then
    raise exception 'Attorney firm is required.' using errcode = '22023';
  end if;
  if v_module_key not in ('transfer', 'bond', 'cancellation') then
    raise exception 'Unsupported attorney module: %', coalesce(nullif(v_module_key, ''), '(blank)') using errcode = '22023';
  end if;
  if not (
    public.attorney_user_is_active_member(p_firm_id)
    or exists (
      select 1
      from public.attorney_firms firm
      where firm.id = p_firm_id
        and firm.created_by = auth.uid()
    )
  ) then
    raise exception 'You do not have access to this attorney firm.' using errcode = '42501';
  end if;

  select module.status = 'active'
  into v_accepts_new_work
  from public.attorney_firm_modules module
  where module.firm_id = p_firm_id
    and module.module_key = v_module_key;

  -- A missing row can only occur during a rolling deployment. Preserve the
  -- pre-module full-service behaviour until the backfill is visible.
  return coalesce(v_accepts_new_work, true);
end;
$$;

revoke all on function public.get_attorney_firm_modules(uuid) from public;
revoke all on function public.set_attorney_firm_module_status(uuid, text, text) from public;
revoke all on function public.attorney_firm_module_accepts_new_work(uuid, text) from public;

grant execute on function public.get_attorney_firm_modules(uuid) to authenticated;
grant execute on function public.set_attorney_firm_module_status(uuid, text, text) to authenticated;
grant execute on function public.attorney_firm_module_accepts_new_work(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
