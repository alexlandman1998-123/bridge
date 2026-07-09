begin;

create table if not exists public.transaction_checklist_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  stage text not null,
  label text not null,
  description text,
  status text not null default 'pending',
  priority text not null default 'required',
  owner_role text not null default 'attorney',
  owner_user_id uuid references auth.users(id) on delete set null,
  linked_document_request_id uuid references public.document_requests(id) on delete set null,
  linked_document_id uuid references public.documents(id) on delete set null,
  auto_rule_key text,
  is_auto_managed boolean not null default false,
  due_date date,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  overridden_by uuid references auth.users(id) on delete set null,
  override_reason text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_checklist_items_status_check
    check (status in ('pending', 'in_progress', 'completed', 'blocked', 'waived')),
  constraint transaction_checklist_items_priority_check
    check (priority in ('required', 'important', 'optional'))
);

alter table if exists public.transaction_checklist_items
  add column if not exists due_date date;

alter table if exists public.transactions
  add column if not exists seller_onboarding_status text not null default 'not_started';

alter table if exists public.documents
  add column if not exists document_name text;

alter table if exists public.transaction_required_documents
  add column if not exists requirement_key text;

alter table if exists public.transaction_rollups
  add column if not exists is_stale boolean not null default false,
  add column if not exists last_error text,
  add column if not exists last_recompute_attempt_at timestamptz;

update public.documents
set document_name = coalesce(
  nullif(trim(document_name), ''),
  nullif(trim(name), ''),
  nullif(trim(file_name), ''),
  nullif(trim(document_type), ''),
  nullif(trim(category), ''),
  'Document'
)
where document_name is null or trim(document_name) = '';

update public.transaction_required_documents
set requirement_key = coalesce(
  nullif(trim(requirement_key), ''),
  nullif(trim(document_key), ''),
  nullif(trim(document_label), ''),
  id::text
)
where requirement_key is null or trim(requirement_key) = '';

update public.transactions
set seller_onboarding_status = coalesce(
  nullif(trim(seller_onboarding_status), ''),
  nullif(trim(onboarding_status), ''),
  'not_started'
)
where seller_onboarding_status is null or trim(seller_onboarding_status) = '';

update public.transaction_rollups
set is_stale = false
where is_stale is null;

do $$
begin
  if to_regclass('public.transaction_checklist_items') is not null then
    create index if not exists transaction_checklist_items_transaction_stage_idx
      on public.transaction_checklist_items (transaction_id, stage, sort_order);
    create index if not exists transaction_checklist_items_owner_status_idx
      on public.transaction_checklist_items (transaction_id, owner_role, status);
    create index if not exists transaction_checklist_items_due_date_idx
      on public.transaction_checklist_items (transaction_id, due_date)
      where due_date is not null;
    create index if not exists transaction_checklist_items_auto_rule_idx
      on public.transaction_checklist_items (transaction_id, auto_rule_key)
      where auto_rule_key is not null;
  end if;

  if to_regclass('public.documents') is not null then
    create index if not exists documents_transaction_document_name_idx
      on public.documents (transaction_id, document_name)
      where transaction_id is not null and document_name is not null;
  end if;

  if to_regclass('public.transaction_required_documents') is not null then
    create index if not exists transaction_required_documents_requirement_key_idx
      on public.transaction_required_documents (transaction_id, requirement_key)
      where requirement_key is not null;
  end if;

  if to_regclass('public.transaction_rollups') is not null then
    create index if not exists transaction_rollups_health_idx
      on public.transaction_rollups (is_stale, last_recompute_attempt_at desc);
  end if;
end $$;

drop trigger if exists transaction_checklist_items_set_updated_at on public.transaction_checklist_items;
create trigger transaction_checklist_items_set_updated_at
before update on public.transaction_checklist_items
for each row
execute function public.bridge_set_updated_at();

alter table if exists public.transaction_checklist_items enable row level security;

drop policy if exists transaction_checklist_items_select_transaction_scope on public.transaction_checklist_items;
create policy transaction_checklist_items_select_transaction_scope
  on public.transaction_checklist_items
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_checklist_items_insert_transaction_scope on public.transaction_checklist_items;
create policy transaction_checklist_items_insert_transaction_scope
  on public.transaction_checklist_items
  for insert
  to authenticated
  with check (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_checklist_items_update_transaction_scope on public.transaction_checklist_items;
create policy transaction_checklist_items_update_transaction_scope
  on public.transaction_checklist_items
  for update
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id))
  with check (public.bridge_can_access_transaction_spine(transaction_id));

grant select, insert, update on public.transaction_checklist_items to authenticated;

comment on table public.transaction_checklist_items is
  'Operational checklist/readiness items linked to transaction workflow lanes and canonical document readiness.';
comment on column public.transaction_checklist_items.due_date is
  'Optional due date used by the workflow read-model to surface overdue checklist blockers.';
comment on column public.transactions.seller_onboarding_status is
  'Seller-side onboarding readiness status consumed by canonical workflow rollups.';
comment on column public.documents.document_name is
  'Compatibility display name for document readiness and workflow evidence matching.';
comment on column public.transaction_required_documents.requirement_key is
  'Compatibility alias for the canonical required-document key used by workflow evidence matching.';
comment on column public.transaction_rollups.is_stale is
  'Explicit stale marker for workflow recompute health checks.';
comment on column public.transaction_rollups.last_error is
  'Last workflow recompute error captured for launch health diagnostics.';
comment on column public.transaction_rollups.last_recompute_attempt_at is
  'Most recent workflow recompute attempt timestamp used by workflow health diagnostics.';

notify pgrst, 'reload schema';

commit;
