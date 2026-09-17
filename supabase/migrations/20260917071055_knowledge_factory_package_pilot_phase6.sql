begin;

-- Phase 6 is a small, named-user pilot. It deliberately does not turn on a
-- package for every user in an organisation merely because its Phase 5 policy
-- says "pilot". The server checks this enrollment before every supplier call.
create table public.knowledge_factory_package_pilot_enrolments (
  organisation_id uuid primary key references public.organisations(id) on delete restrict,
  status text not null default 'candidate' check (status in ('candidate', 'active', 'paused', 'completed')),
  allowed_user_ids uuid[] not null default '{}'::uuid[] check (
    cardinality(allowed_user_ids) <= 5
  ),
  activated_by uuid references auth.users(id) on delete restrict,
  activated_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_factory_package_pilot_enrolments_state_check check (
    (status = 'active' and cardinality(allowed_user_ids) > 0 and activated_at is not null)
    or (status = 'paused' and paused_at is not null)
    or (status in ('candidate', 'completed'))
  )
);

alter table public.knowledge_factory_package_pilot_enrolments enable row level security;
revoke all on public.knowledge_factory_package_pilot_enrolments from anon, authenticated;
grant select on public.knowledge_factory_package_pilot_enrolments to authenticated;

create policy knowledge_factory_package_pilot_enrolments_admin_read
on public.knowledge_factory_package_pilot_enrolments for select to authenticated
using (public.knowledge_factory_is_active_member(
  organisation_id,
  array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
));

comment on table public.knowledge_factory_package_pilot_enrolments is 'Phase 6 named-user package-report pilot cohort. An active row is checked server-side with the private pilot gate before supplier report execution.';

commit;
