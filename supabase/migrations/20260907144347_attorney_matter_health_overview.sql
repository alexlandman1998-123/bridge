begin;

create table if not exists public.transaction_matter_health (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  overall_status text not null default 'in_progress'
    check (overall_status in ('healthy', 'in_progress', 'attention_required', 'at_risk', 'on_hold')),
  estimated_lodgement_date date,
  estimated_registration_date date,
  financial_summary_amount numeric(14,2),
  financial_summary_label text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.transaction_matter_health_audit (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  changed_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists transaction_matter_health_audit_transaction_created_idx
  on public.transaction_matter_health_audit (transaction_id, created_at desc);

alter table public.transaction_matter_health enable row level security;
alter table public.transaction_matter_health_audit enable row level security;

drop policy if exists transaction_matter_health_select_scope on public.transaction_matter_health;
create policy transaction_matter_health_select_scope
  on public.transaction_matter_health
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_matter_health_insert_scope on public.transaction_matter_health;
create policy transaction_matter_health_insert_scope
  on public.transaction_matter_health
  for insert
  to authenticated
  with check (
    (select public.bridge_is_admin())
    or (select public.bridge_attorney_can_manage_transaction(transaction_id))
    or (
      (select public.bridge_current_profile_role()) = 'attorney'
      and (select public.bridge_has_transaction_access(transaction_id))
    )
  );

drop policy if exists transaction_matter_health_update_scope on public.transaction_matter_health;
create policy transaction_matter_health_update_scope
  on public.transaction_matter_health
  for update
  to authenticated
  using (
    (select public.bridge_is_admin())
    or (select public.bridge_attorney_can_manage_transaction(transaction_id))
    or (
      (select public.bridge_current_profile_role()) = 'attorney'
      and (select public.bridge_has_transaction_access(transaction_id))
    )
  )
  with check (
    (select public.bridge_is_admin())
    or (select public.bridge_attorney_can_manage_transaction(transaction_id))
    or (
      (select public.bridge_current_profile_role()) = 'attorney'
      and (select public.bridge_has_transaction_access(transaction_id))
    )
  );

drop policy if exists transaction_matter_health_audit_select_scope on public.transaction_matter_health_audit;
create policy transaction_matter_health_audit_select_scope
  on public.transaction_matter_health_audit
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_matter_health_audit_insert_scope on public.transaction_matter_health_audit;
create policy transaction_matter_health_audit_insert_scope
  on public.transaction_matter_health_audit
  for insert
  to authenticated
  with check (
    (select public.bridge_is_admin())
    or (select public.bridge_attorney_can_manage_transaction(transaction_id))
    or (
      (select public.bridge_current_profile_role()) = 'attorney'
      and (select public.bridge_has_transaction_access(transaction_id))
    )
  );

create or replace function public.touch_transaction_matter_health()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists transaction_matter_health_touch on public.transaction_matter_health;
create trigger transaction_matter_health_touch
  before insert or update on public.transaction_matter_health
  for each row execute function public.touch_transaction_matter_health();

commit;
