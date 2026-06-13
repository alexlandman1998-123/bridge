begin;

alter table if exists public.partner_routing_rules
  add column if not exists target_role_type text,
  add column if not exists target_scope_name text;

alter table if exists public.partner_routing_rules
  drop constraint if exists partner_routing_rules_source_scope_check,
  add constraint partner_routing_rules_source_scope_check
    check (source_scope in ('organisation', 'region', 'branch', 'team', 'development', 'agent', 'user'));

alter table if exists public.partner_routing_rules
  drop constraint if exists partner_routing_rules_assignment_mode_check,
  add constraint partner_routing_rules_assignment_mode_check
    check (
      assignment_mode in (
        'direct_consultant',
        'direct_attorney',
        'direct_agent',
        'branch_queue',
        'team_queue',
        'organisation_queue',
        'manual',
        'fallback_queue',
        'round_robin'
      )
    );

create index if not exists partner_routing_rules_target_role_idx
  on public.partner_routing_rules (target_role_type)
  where target_role_type is not null;

commit;
