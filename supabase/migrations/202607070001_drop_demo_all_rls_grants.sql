-- Remove legacy local-demo RLS policies and broad grants from shared databases.
--
-- The baseline schema used to create *_demo_all policies with using (true) and
-- broad table/default grants for anon/authenticated. Those are not safe outside
-- local throwaway demos. This migration is idempotent and keeps service_role
-- untouched.

begin;

create temp table legacy_demo_rls_tables (
  table_name text primary key
) on commit drop;

insert into legacy_demo_rls_tables (table_name)
values
  ('profiles'),
  ('firms'),
  ('firm_memberships'),
  ('developments'),
  ('units'),
  ('buyers'),
  ('transactions'),
  ('transaction_finance_details'),
  ('transaction_subprocesses'),
  ('transaction_subprocess_steps'),
  ('transaction_onboarding'),
  ('onboarding_form_data'),
  ('document_groups'),
  ('document_templates'),
  ('document_requirement_rules'),
  ('transaction_required_documents'),
  ('transaction_participants'),
  ('transaction_comments'),
  ('transaction_status_links'),
  ('transaction_events'),
  ('transaction_readiness_states'),
  ('transaction_notifications'),
  ('transaction_external_access'),
  ('document_request_groups'),
  ('document_requests'),
  ('transaction_checklist_items'),
  ('transaction_issue_overrides'),
  ('development_settings'),
  ('development_attorney_configs'),
  ('development_attorney_required_closeout_docs'),
  ('transaction_attorney_closeouts'),
  ('transaction_attorney_closeout_documents'),
  ('development_bond_configs'),
  ('development_bond_required_closeout_docs'),
  ('transaction_bond_closeouts'),
  ('transaction_bond_closeout_documents'),
  ('client_portal_links'),
  ('client_portal_contexts'),
  ('client_seller_interest_requests'),
  ('client_issues'),
  ('alteration_requests'),
  ('service_reviews'),
  ('trust_investment_forms'),
  ('transaction_handover'),
  ('snapshot_links'),
  ('notes'),
  ('documents'),
  ('document_requirements')
on conflict (table_name) do nothing;

insert into legacy_demo_rls_tables (table_name)
select distinct tablename
from pg_policies
where schemaname = 'public'
  and policyname like '%!_demo!_all' escape '!'
on conflict (table_name) do nothing;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like '%!_demo!_all' escape '!'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

do $$
declare
  table_record record;
begin
  for table_record in
    select table_name
    from legacy_demo_rls_tables
    where to_regclass(format('public.%I', table_name)) is not null
    order by table_name
  loop
    execute format('revoke all privileges on table public.%I from anon', table_record.table_name);
    execute format(
      'revoke insert, update, delete, truncate on table public.%I from authenticated',
      table_record.table_name
    );
  end loop;
end;
$$;

grant usage on schema public to anon, authenticated;

revoke all privileges on all sequences in schema public from anon;
revoke update on all sequences in schema public from authenticated;

alter default privileges in schema public
revoke all privileges on tables from anon;

alter default privileges in schema public
revoke insert, update, delete, truncate on tables from authenticated;

alter default privileges in schema public
revoke all privileges on sequences from anon;

alter default privileges in schema public
revoke update on sequences from authenticated;

do $$
declare
  finding_count integer;
begin
  select count(*)
  into finding_count
  from pg_policies
  where schemaname = 'public'
    and policyname like '%!_demo!_all' escape '!';

  if finding_count > 0 then
    raise exception 'demo-wide RLS policies still exist after hardening migration';
  end if;

  select count(*)
  into finding_count
  from information_schema.role_table_grants grants
  join legacy_demo_rls_tables demo_tables
    on demo_tables.table_name = grants.table_name
  where grants.table_schema = 'public'
    and grants.grantee = 'anon';

  if finding_count > 0 then
    raise exception 'anon still has direct table grants on legacy demo tables after hardening migration';
  end if;

  select count(*)
  into finding_count
  from information_schema.role_table_grants grants
  join legacy_demo_rls_tables demo_tables
    on demo_tables.table_name = grants.table_name
  where grants.table_schema = 'public'
    and grants.grantee = 'authenticated'
    and grants.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

  if finding_count > 0 then
    raise exception 'authenticated still has broad write grants on legacy demo tables after hardening migration';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
