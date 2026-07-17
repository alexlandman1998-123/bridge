begin;

create table if not exists public.attorney_firm_module_history (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  module_key text not null,
  previous_status text,
  new_status text not null,
  open_matter_count integer not null default 0,
  changed_by uuid references auth.users(id) on delete set null,
  change_source text not null default 'firm_settings',
  changed_at timestamptz not null default now(),
  constraint attorney_firm_module_history_module_key_check
    check (module_key in ('transfer', 'bond', 'cancellation')),
  constraint attorney_firm_module_history_previous_status_check
    check (previous_status is null or previous_status in ('active', 'winding_down', 'inactive')),
  constraint attorney_firm_module_history_new_status_check
    check (new_status in ('active', 'winding_down', 'inactive')),
  constraint attorney_firm_module_history_open_matter_count_check
    check (open_matter_count >= 0),
  constraint attorney_firm_module_history_change_source_check
    check (change_source in ('baseline', 'firm_settings', 'system'))
);

create index if not exists attorney_firm_module_history_firm_changed_idx
  on public.attorney_firm_module_history (firm_id, changed_at desc);

create index if not exists attorney_firm_module_history_firm_module_changed_idx
  on public.attorney_firm_module_history (firm_id, module_key, changed_at desc);

comment on table public.attorney_firm_module_history is
  'Immutable lifecycle history for attorney service-module status transitions and their open-matter snapshot.';

-- Establish an auditable baseline for module rows created before Phase 7.
insert into public.attorney_firm_module_history (
  firm_id,
  module_key,
  previous_status,
  new_status,
  open_matter_count,
  changed_by,
  change_source,
  changed_at
)
select
  module.firm_id,
  module.module_key,
  null,
  module.status,
  public.attorney_firm_module_open_matter_count(module.firm_id, module.module_key),
  module.changed_by,
  'baseline',
  coalesce(module.updated_at, module.created_at, now())
from public.attorney_firm_modules module
where not exists (
  select 1
  from public.attorney_firm_module_history history
  where history.firm_id = module.firm_id
    and history.module_key = module.module_key
);

create or replace function public.audit_attorney_firm_module_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.attorney_firm_module_history (
    firm_id,
    module_key,
    previous_status,
    new_status,
    open_matter_count,
    changed_by,
    change_source
  )
  values (
    new.firm_id,
    new.module_key,
    old.status,
    new.status,
    public.attorney_firm_module_open_matter_count(new.firm_id, new.module_key),
    coalesce(new.changed_by, auth.uid()),
    'firm_settings'
  );

  return new;
end;
$$;

drop trigger if exists trg_audit_attorney_firm_module_status_change
  on public.attorney_firm_modules;
create trigger trg_audit_attorney_firm_module_status_change
after update of status on public.attorney_firm_modules
for each row
when (old.status is distinct from new.status)
execute function public.audit_attorney_firm_module_status_change();

alter table public.attorney_firm_module_history enable row level security;

drop policy if exists attorney_firm_module_history_select_member
  on public.attorney_firm_module_history;
create policy attorney_firm_module_history_select_member
  on public.attorney_firm_module_history
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

create or replace function public.get_attorney_firm_module_history(
  p_firm_id uuid,
  p_limit integer default 20
)
returns table (
  id uuid,
  firm_id uuid,
  module_key text,
  previous_status text,
  new_status text,
  open_matter_count integer,
  changed_by uuid,
  changed_by_name text,
  change_source text,
  changed_at timestamptz
)
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
  select
    history.id,
    history.firm_id,
    history.module_key,
    history.previous_status,
    history.new_status,
    history.open_matter_count,
    history.changed_by,
    coalesce(
      nullif(trim(profile.full_name), ''),
      nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
      nullif(trim(profile.email), ''),
      case when history.change_source = 'baseline' then 'System baseline' else 'Firm administrator' end
    ),
    history.change_source,
    history.changed_at
  from public.attorney_firm_module_history history
  left join public.profiles profile on profile.id = history.changed_by
  where history.firm_id = p_firm_id
  order by history.changed_at desc, history.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

create or replace function public.get_attorney_firm_module_lifecycle_assurance(
  p_firm_id uuid
)
returns table (
  module_key text,
  status text,
  open_matter_count integer,
  accepts_new_work boolean,
  is_operational boolean,
  ready_to_deactivate boolean,
  last_transition_at timestamptz
)
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
  select
    module.module_key,
    module.status,
    counts.open_matter_count,
    module.status = 'active',
    module.status in ('active', 'winding_down'),
    module.status = 'winding_down' and counts.open_matter_count = 0,
    latest.changed_at
  from public.attorney_firm_modules module
  cross join lateral (
    select public.attorney_firm_module_open_matter_count(module.firm_id, module.module_key) as open_matter_count
  ) counts
  left join lateral (
    select history.changed_at
    from public.attorney_firm_module_history history
    where history.firm_id = module.firm_id
      and history.module_key = module.module_key
    order by history.changed_at desc, history.id desc
    limit 1
  ) latest on true
  where module.firm_id = p_firm_id
  order by case module.module_key
    when 'transfer' then 1
    when 'bond' then 2
    else 3
  end;
end;
$$;

revoke all on table public.attorney_firm_module_history from public, anon;
revoke all on function public.get_attorney_firm_module_history(uuid, integer) from public;
revoke all on function public.get_attorney_firm_module_lifecycle_assurance(uuid) from public;

grant select on table public.attorney_firm_module_history to authenticated;
grant execute on function public.get_attorney_firm_module_history(uuid, integer) to authenticated;
grant execute on function public.get_attorney_firm_module_lifecycle_assurance(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
