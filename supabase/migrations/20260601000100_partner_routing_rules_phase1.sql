begin;
create extension if not exists "pgcrypto";
create table if not exists public.partner_routing_rules (
  id uuid primary key default gen_random_uuid(),
  source_organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_scope text not null default 'organisation',
  source_context_id uuid,
  source_user_id uuid references auth.users(id) on delete set null,
  target_organisation_id uuid not null references public.organisations(id) on delete cascade,
  target_scope text not null default 'organisation_queue',
  target_region_id uuid references public.workspace_regions(id) on delete set null,
  target_workspace_unit_id uuid references public.workspace_units(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  assignment_mode text not null default 'manual',
  assignment_priority integer not null default 500,
  is_active boolean not null default true,
  is_default boolean not null default false,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_routing_rules_source_scope_check
    check (source_scope in ('organisation', 'branch', 'team', 'development', 'agent')),
  constraint partner_routing_rules_target_scope_check
    check (
      target_scope in ('organisation_queue', 'region', 'branch', 'team', 'consultant')
    ),
  constraint partner_routing_rules_assignment_mode_check
    check (
      assignment_mode in ('direct_consultant', 'team_queue', 'organisation_queue', 'manual', 'fallback_queue', 'round_robin')
    ),
  constraint partner_routing_rules_assignment_priority_check
    check (assignment_priority is null or assignment_priority >= 0),
  constraint partner_routing_rules_target_scope_payload_check
    check (
      (target_scope = 'consultant' and target_user_id is not null)
      or (target_scope = 'region' and target_region_id is not null)
      or (target_scope in ('branch', 'team') and target_workspace_unit_id is not null)
      or (target_scope = 'organisation_queue')
    ),
  constraint partner_routing_rules_source_payload_check
    check (
      (source_scope = 'agent' and source_user_id is not null and source_context_id is null)
      or (source_scope = 'development' and source_context_id is not null and source_user_id is null)
      or (source_scope in ('organisation', 'branch', 'team') and source_context_id is not null and source_user_id is null)
      or (source_scope = 'organisation' and source_context_id is null and source_user_id is null)
)
);
create index if not exists partner_routing_rules_source_idx
  on public.partner_routing_rules (
    source_organisation_id,
    source_scope,
    is_active,
    assignment_priority
  );
create index if not exists partner_routing_rules_target_idx
  on public.partner_routing_rules (
    target_organisation_id,
    target_scope,
    is_active
  );
create index if not exists partner_routing_rules_mode_idx
  on public.partner_routing_rules (assignment_mode);
create index if not exists partner_routing_rules_target_user_idx
  on public.partner_routing_rules (target_user_id)
  where target_scope = 'consultant';
create unique index if not exists partner_routing_rules_source_context_priority_ukey
  on public.partner_routing_rules (
    source_organisation_id,
    source_scope,
    coalesce(source_context_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(source_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    target_organisation_id,
    target_scope,
    coalesce(target_region_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(target_workspace_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(target_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    assignment_mode,
    assignment_priority
  )
  where is_active = true;
drop trigger if exists trg_partner_routing_rules_updated_at on public.partner_routing_rules;
create trigger trg_partner_routing_rules_updated_at
before update on public.partner_routing_rules
for each row
execute function public.set_updated_at_timestamp();
alter table if exists public.transactions
  add column if not exists bond_assignment_rule_id uuid references public.partner_routing_rules(id) on delete set null,
  add column if not exists bond_assignment_method text;
alter table if exists public.transaction_bond_applications
  add column if not exists assignment_rule_id uuid references public.partner_routing_rules(id) on delete set null,
  add column if not exists assignment_method text;
create index if not exists transactions_bond_assignment_rule_idx
  on public.transactions (bond_assignment_rule_id);
create index if not exists transactions_bond_assignment_method_idx
  on public.transactions (bond_assignment_method)
  where bond_assignment_method is not null;
create index if not exists transaction_bond_applications_assignment_rule_idx
  on public.transaction_bond_applications (assignment_rule_id);
create index if not exists transaction_bond_applications_assignment_method_idx
  on public.transaction_bond_applications (assignment_method)
  where assignment_method is not null;
alter table if exists public.partner_routing_rules enable row level security;
drop policy if exists partner_routing_rules_select on public.partner_routing_rules;
create policy partner_routing_rules_select
  on public.partner_routing_rules
  for select
  to authenticated
  using (
    public.bridge_is_org_admin(source_organisation_id)
    or public.bridge_is_org_admin(target_organisation_id)
  );
drop policy if exists partner_routing_rules_insert on public.partner_routing_rules;
create policy partner_routing_rules_insert
  on public.partner_routing_rules
  for insert
  to authenticated
  with check (public.bridge_is_org_admin(source_organisation_id));
drop policy if exists partner_routing_rules_update on public.partner_routing_rules;
create policy partner_routing_rules_update
  on public.partner_routing_rules
  for update
  to authenticated
  using (public.bridge_is_org_admin(source_organisation_id))
  with check (public.bridge_is_org_admin(source_organisation_id));
drop policy if exists partner_routing_rules_delete on public.partner_routing_rules;
create policy partner_routing_rules_delete
  on public.partner_routing_rules
  for delete
  to authenticated
  using (public.bridge_is_org_admin(source_organisation_id));
grant select, insert, update, delete on public.partner_routing_rules to authenticated;
notify pgrst, 'reload schema';
commit;
