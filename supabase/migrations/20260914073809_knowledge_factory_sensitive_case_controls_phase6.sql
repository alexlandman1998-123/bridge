-- Phase 6: server-mediated sensitive lookup approval boundary.
-- This workflow records only a request, consent version and review decision. It
-- must never contain identity numbers, bureau/deeds results or raw provider data.

begin;

alter table public.knowledge_factory_sensitive_lookup_cases
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

create table if not exists public.knowledge_factory_sensitive_lookup_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.knowledge_factory_sensitive_lookup_cases(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('requested', 'approved', 'rejected', 'cancelled')),
  event_note text,
  created_at timestamptz not null default now(),
  constraint knowledge_factory_sensitive_lookup_events_note_length check (event_note is null or length(btrim(event_note)) <= 500)
);

create index if not exists knowledge_factory_sensitive_lookup_events_case_created_idx
  on public.knowledge_factory_sensitive_lookup_events (case_id, created_at desc);

alter table public.knowledge_factory_sensitive_lookup_events enable row level security;
revoke all on public.knowledge_factory_sensitive_lookup_events from anon, authenticated;
grant select on public.knowledge_factory_sensitive_lookup_events to authenticated;

-- Browser access is read-only after this migration. A Vercel server route
-- authenticates the caller, validates consent and writes both the case and its
-- immutable audit event with the service role.
revoke insert, update, delete on public.knowledge_factory_sensitive_lookup_cases from authenticated;

drop policy if exists knowledge_factory_sensitive_lookup_cases_insert on public.knowledge_factory_sensitive_lookup_cases;
drop policy if exists knowledge_factory_sensitive_lookup_cases_admin_update on public.knowledge_factory_sensitive_lookup_cases;

drop policy if exists knowledge_factory_sensitive_lookup_events_read on public.knowledge_factory_sensitive_lookup_events;
create policy knowledge_factory_sensitive_lookup_events_read
on public.knowledge_factory_sensitive_lookup_events for select to authenticated
using (
  exists (
    select 1
    from public.knowledge_factory_sensitive_lookup_cases case_row
    where case_row.id = case_id
      and (
        case_row.created_by = (select auth.uid())
        or public.knowledge_factory_is_active_member(
          case_row.organisation_id,
          array['principal', 'owner', 'director', 'admin', 'super_admin', 'agency_admin']
        )
      )
  )
);

comment on table public.knowledge_factory_sensitive_lookup_cases is
  'Approval-only sensitive lookup workflow. Never store identity numbers, provider payloads, credit results or deeds-party data.';
comment on table public.knowledge_factory_sensitive_lookup_events is
  'Immutable sensitive lookup workflow audit. Contains action metadata only; never provider output.';

notify pgrst, 'reload schema';
commit;
