-- Close staging drift where canonical document tables regained anon SELECT.
--
-- Public/client access to canonical documents should flow through explicit
-- token/RPC paths, not direct anon table grants. Reference tables remain
-- authenticated-readable, and service_role keeps CRUD for operational jobs.

begin;

create temp table canonical_document_anon_hardening_tables (
  table_name text primary key
) on commit drop;

insert into canonical_document_anon_hardening_tables (table_name)
values
  ('document_packs'),
  ('document_definitions'),
  ('document_requirement_rules'),
  ('document_requirement_instances'),
  ('document_requirement_reviews'),
  ('document_requirement_events'),
  ('document_requirement_reminders'),
  ('document_requirement_reminder_items')
on conflict (table_name) do nothing;

do $$
declare
  table_record record;
begin
  for table_record in
    select table_name
    from canonical_document_anon_hardening_tables
    where to_regclass(format('public.%I', table_name)) is not null
    order by table_name
  loop
    execute format('alter table public.%I enable row level security', table_record.table_name);
    execute format('revoke all privileges on table public.%I from anon', table_record.table_name);
    execute format('grant all on table public.%I to service_role', table_record.table_name);
  end loop;
end;
$$;

do $$
begin
  if to_regclass('public.document_packs') is not null then
    execute 'drop policy if exists document_packs_anon_select on public.document_packs';
    execute 'grant select on table public.document_packs to authenticated';
  end if;

  if to_regclass('public.document_definitions') is not null then
    execute 'drop policy if exists document_definitions_anon_active_select on public.document_definitions';
    execute 'grant select on table public.document_definitions to authenticated';
  end if;

  if to_regclass('public.document_requirement_rules') is not null then
    execute 'drop policy if exists document_requirement_rules_anon_active_select on public.document_requirement_rules';
  end if;

  if to_regclass('public.document_requirement_instances') is not null then
    execute 'drop policy if exists document_requirement_instances_client_portal_select on public.document_requirement_instances';
  end if;
end;
$$;

do $$
declare
  finding_count integer;
begin
  select count(*)
  into finding_count
  from information_schema.role_table_grants grants
  join canonical_document_anon_hardening_tables hardening_tables
    on hardening_tables.table_name = grants.table_name
  where grants.table_schema = 'public'
    and grants.grantee = 'anon';

  if finding_count > 0 then
    raise exception 'anon still has direct canonical document table grants after hardening migration';
  end if;

  select count(*)
  into finding_count
  from information_schema.role_table_grants grants
  where grants.table_schema = 'public'
    and grants.grantee = 'authenticated'
    and grants.table_name in (
      'document_requirement_rules',
      'document_requirement_instances',
      'document_requirement_reviews',
      'document_requirement_events',
      'document_requirement_reminders',
      'document_requirement_reminder_items'
    )
    and grants.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

  if finding_count > 0 then
    raise exception 'authenticated still has broad canonical operational writes after hardening migration';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
