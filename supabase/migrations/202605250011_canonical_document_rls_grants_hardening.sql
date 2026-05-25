-- Canonical Document System RLS/grants hardening.
--
-- This migration intentionally keeps rollout mode unchanged. It only hardens
-- direct table access for canonical document tables and adds narrowly-scoped
-- helper RPCs for staging verification/service operations.

begin;

alter table if exists public.document_packs enable row level security;
alter table if exists public.document_definitions enable row level security;
alter table if exists public.document_requirement_rules enable row level security;
alter table if exists public.document_requirement_instances enable row level security;
alter table if exists public.document_requirement_reviews enable row level security;
alter table if exists public.document_requirement_events enable row level security;
alter table if exists public.document_requirement_reminders enable row level security;
alter table if exists public.document_requirement_reminder_items enable row level security;

drop policy if exists document_requirement_rules_demo_all on public.document_requirement_rules;

drop policy if exists document_packs_authenticated_read on public.document_packs;
drop policy if exists document_definitions_authenticated_read on public.document_definitions;

drop policy if exists document_packs_service_role_all on public.document_packs;
drop policy if exists document_definitions_service_role_all on public.document_definitions;
drop policy if exists document_requirement_rules_service_role_all on public.document_requirement_rules;
drop policy if exists document_requirement_instances_service_role_all on public.document_requirement_instances;
drop policy if exists document_requirement_reviews_service_role_all on public.document_requirement_reviews;
drop policy if exists document_requirement_events_service_role_all on public.document_requirement_events;
drop policy if exists document_requirement_reminders_service_role_all on public.document_requirement_reminders;
drop policy if exists document_requirement_reminder_items_service_role_all on public.document_requirement_reminder_items;

revoke all on table public.document_packs from anon, authenticated;
revoke all on table public.document_definitions from anon, authenticated;
revoke all on table public.document_requirement_rules from anon, authenticated;
revoke all on table public.document_requirement_instances from anon, authenticated;
revoke all on table public.document_requirement_reviews from anon, authenticated;
revoke all on table public.document_requirement_events from anon, authenticated;
revoke all on table public.document_requirement_reminders from anon, authenticated;
revoke all on table public.document_requirement_reminder_items from anon, authenticated;

grant select on table public.document_packs to authenticated;
grant select on table public.document_definitions to authenticated;

grant all on table public.document_packs to service_role;
grant all on table public.document_definitions to service_role;
grant all on table public.document_requirement_rules to service_role;
grant all on table public.document_requirement_instances to service_role;
grant all on table public.document_requirement_reviews to service_role;
grant all on table public.document_requirement_events to service_role;
grant all on table public.document_requirement_reminders to service_role;
grant all on table public.document_requirement_reminder_items to service_role;

create policy document_packs_authenticated_read
on public.document_packs
for select
to authenticated
using (is_active = true);

create policy document_definitions_authenticated_read
on public.document_definitions
for select
to authenticated
using (is_active = true);

create policy document_packs_service_role_all
on public.document_packs
for all
to service_role
using (true)
with check (true);

create policy document_definitions_service_role_all
on public.document_definitions
for all
to service_role
using (true)
with check (true);

create policy document_requirement_rules_service_role_all
on public.document_requirement_rules
for all
to service_role
using (true)
with check (true);

create policy document_requirement_instances_service_role_all
on public.document_requirement_instances
for all
to service_role
using (true)
with check (true);

create policy document_requirement_reviews_service_role_all
on public.document_requirement_reviews
for all
to service_role
using (true)
with check (true);

create policy document_requirement_events_service_role_all
on public.document_requirement_events
for all
to service_role
using (true)
with check (true);

create policy document_requirement_reminders_service_role_all
on public.document_requirement_reminders
for all
to service_role
using (true)
with check (true);

create policy document_requirement_reminder_items_service_role_all
on public.document_requirement_reminder_items
for all
to service_role
using (true)
with check (true);

create or replace function public.canonical_document_verification_snapshot(
  p_purpose text default 'canonical_staging_verification'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_purpose is distinct from 'canonical_staging_verification' then
    raise exception 'invalid verification purpose' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'document_definitions', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.document_definitions order by key) t), '[]'::jsonb),
    'document_requirement_rules', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.document_requirement_rules order by created_at, id) t), '[]'::jsonb),
    'document_requirement_instances', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.document_requirement_instances order by created_at, id) t), '[]'::jsonb),
    'private_listing_document_requirements', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.private_listing_document_requirements order by created_at, id) t), '[]'::jsonb),
    'private_listing_documents', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.private_listing_documents order by created_at, id) t), '[]'::jsonb),
    'transaction_required_documents', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.transaction_required_documents order by created_at, id) t), '[]'::jsonb),
    'document_requests', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.document_requests order by created_at, id) t), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.documents order by created_at, id) t), '[]'::jsonb),
    'document_packets', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.document_packets order by created_at, id) t), '[]'::jsonb),
    'document_packet_versions', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.document_packet_versions order by created_at, id) t), '[]'::jsonb),
    'document_requirement_reminders', coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.document_requirement_reminders order by created_at, id) t), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.canonical_document_verification_snapshot(text) from public, anon, authenticated;
grant execute on function public.canonical_document_verification_snapshot(text) to anon, authenticated, service_role;

create or replace function public.canonical_document_rls_grants_audit()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical_tables constant text[] := array[
    'document_packs',
    'document_definitions',
    'document_requirement_rules',
    'document_requirement_instances',
    'document_requirement_reviews',
    'document_requirement_events',
    'document_requirement_reminders',
    'document_requirement_reminder_items'
  ];
  operational_tables constant text[] := array[
    'document_requirement_rules',
    'document_requirement_instances',
    'document_requirement_reviews',
    'document_requirement_events',
    'document_requirement_reminders',
    'document_requirement_reminder_items'
  ];
begin
  return jsonb_build_object(
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'table_name', c.relname,
        'rls_enabled', c.relrowsecurity,
        'anon_privileges', coalesce((
          select jsonb_agg(g.privilege_type order by g.privilege_type)
          from information_schema.role_table_grants g
          where g.table_schema = 'public'
            and g.table_name = c.relname
            and g.grantee = 'anon'
        ), '[]'::jsonb),
        'authenticated_privileges', coalesce((
          select jsonb_agg(g.privilege_type order by g.privilege_type)
          from information_schema.role_table_grants g
          where g.table_schema = 'public'
            and g.table_name = c.relname
            and g.grantee = 'authenticated'
        ), '[]'::jsonb),
        'service_role_privileges', coalesce((
          select jsonb_agg(g.privilege_type order by g.privilege_type)
          from information_schema.role_table_grants g
          where g.table_schema = 'public'
            and g.table_name = c.relname
            and g.grantee = 'service_role'
        ), '[]'::jsonb),
        'policies', coalesce((
          select jsonb_agg(jsonb_build_object(
            'policyname', p.policyname,
            'cmd', p.cmd,
            'roles', p.roles,
            'qual', p.qual,
            'with_check', p.with_check
          ) order by p.policyname)
          from pg_policies p
          where p.schemaname = 'public'
            and p.tablename = c.relname
        ), '[]'::jsonb)
      ) order by c.relname)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relname = any(canonical_tables)
    ), '[]'::jsonb),
    'checks', jsonb_build_object(
      'operational_broad_anon_access', exists (
        select 1
        from information_schema.role_table_grants g
        where g.table_schema = 'public'
          and g.table_name = any(operational_tables)
          and g.grantee = 'anon'
      ),
      'operational_broad_authenticated_write', exists (
        select 1
        from information_schema.role_table_grants g
        where g.table_schema = 'public'
          and g.table_name = any(operational_tables)
          and g.grantee = 'authenticated'
          and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      ),
      'reference_authenticated_readable', (
        select count(*) = 2
        from information_schema.role_table_grants g
        where g.table_schema = 'public'
          and g.table_name in ('document_packs', 'document_definitions')
          and g.grantee = 'authenticated'
          and g.privilege_type = 'SELECT'
      ),
      'rules_has_no_anon_table_access', not exists (
        select 1
        from information_schema.role_table_grants g
        where g.table_schema = 'public'
          and g.table_name = 'document_requirement_rules'
          and g.grantee = 'anon'
      ),
      'all_canonical_tables_rls_enabled', (
        select count(*) = cardinality(canonical_tables)
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relname = any(canonical_tables)
          and c.relrowsecurity = true
      ),
      'service_role_has_crud_on_all_canonical_tables', not exists (
        select 1
        from unnest(canonical_tables) as table_name
        cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege_type
        where not exists (
          select 1
          from information_schema.role_table_grants g
          where g.table_schema = 'public'
            and g.table_name = table_name
            and g.grantee = 'service_role'
            and g.privilege_type = privilege_type
        )
      )
    )
  );
end;
$$;

revoke all on function public.canonical_document_rls_grants_audit() from public, anon, authenticated;
grant execute on function public.canonical_document_rls_grants_audit() to anon, authenticated, service_role;

create or replace function public.canonical_document_service_insert_reminder(
  p_requirement_instance_id uuid,
  p_context_type text,
  p_context_id uuid,
  p_recipient_role text default null,
  p_recipient_contact_id uuid default null,
  p_recipient_email text default null,
  p_reminder_type text default 'manual_follow_up',
  p_channel text default 'manual',
  p_status text default 'scheduled',
  p_metadata_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  if coalesce(auth.role(), current_user) <> 'service_role' and current_user <> 'postgres' then
    raise exception 'service role required for canonical reminder inserts' using errcode = '42501';
  end if;

  insert into public.document_requirement_reminders (
    requirement_instance_id,
    context_type,
    context_id,
    recipient_role,
    recipient_contact_id,
    recipient_email,
    reminder_type,
    channel,
    status,
    metadata_json
  )
  values (
    p_requirement_instance_id,
    p_context_type,
    p_context_id,
    p_recipient_role,
    p_recipient_contact_id,
    p_recipient_email,
    p_reminder_type,
    p_channel,
    p_status,
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.canonical_document_service_insert_reminder(uuid, text, uuid, text, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.canonical_document_service_insert_reminder(uuid, text, uuid, text, uuid, text, text, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
