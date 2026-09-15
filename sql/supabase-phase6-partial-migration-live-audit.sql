-- Read-only catalog audit for the four migrations that stopped partway through
-- on production.  It deliberately reports metadata only: no application or
-- provider payloads are selected.
with expected_columns(schema_name, table_name, column_name) as (
  values
    ('public', 'knowledge_factory_fica_cases', 'subject_user_id'),
    ('public', 'knowledge_factory_fica_cases', 'shared_party_user_ids'),
    ('public', 'knowledge_factory_fica_cases', 'assigned_staff_user_ids'),
    ('public', 'website_blog_posts', 'content_blocks'),
    ('public', 'website_blog_posts', 'lifecycle_status'),
    ('public', 'website_blog_posts', 'scheduled_for'),
    ('public', 'website_blog_posts', 'archived_at')
),
expected_tables(schema_name, table_name) as (
  values
    ('public', 'knowledge_factory_fica_audit_events'),
    ('public', 'website_blog_slug_redirects')
),
expected_constraints(schema_name, table_name, constraint_name) as (
  values
    ('public', 'knowledge_factory_fica_audit_events', 'knowledge_factory_fica_audit_events_metadata_object'),
    ('public', 'website_blog_posts', 'website_blog_posts_content_blocks_array_check'),
    ('public', 'website_blog_posts', 'website_blog_posts_lifecycle_status_check'),
    ('public', 'website_blog_posts', 'website_blog_posts_schedule_check')
),
expected_functions(signature) as (
  values
    ('public.knowledge_factory_fica_is_privileged(uuid)'),
    ('public.knowledge_factory_fica_guard_case_update()'),
    ('public.knowledge_factory_fica_write_audit_event()'),
    ('public.website_media_storage_org_id(text)'),
    ('public.website_media_storage_path_is_valid(text)'),
    ('public.website_blog_available_listings(uuid)'),
    ('public.website_save_draft_blog_post(uuid,uuid,uuid,text,text,text,text,text,text,jsonb,text,text,text)'),
    ('public.website_publish_revision(uuid,uuid)'),
    ('public.website_manage_draft_blog_post(uuid,uuid,uuid,text,timestamptz)')
),
expected_triggers(schema_name, table_name, trigger_name) as (
  values
    ('public', 'knowledge_factory_fica_cases', 'knowledge_factory_fica_cases_guard_update'),
    ('public', 'knowledge_factory_fica_cases', 'knowledge_factory_fica_cases_audit_insert'),
    ('public', 'knowledge_factory_fica_cases', 'knowledge_factory_fica_cases_audit_update')
),
expected_policies(schema_name, table_name, policy_name) as (
  values
    ('public', 'knowledge_factory_fica_cases', 'knowledge_factory_fica_cases_read'),
    ('public', 'knowledge_factory_fica_cases', 'knowledge_factory_fica_cases_insert'),
    ('public', 'knowledge_factory_fica_cases', 'knowledge_factory_fica_cases_update'),
    ('public', 'knowledge_factory_fica_audit_events', 'knowledge_factory_fica_audit_events_read'),
    ('storage', 'objects', 'website_media_admin_insert'),
    ('storage', 'objects', 'website_media_admin_update'),
    ('storage', 'objects', 'website_media_admin_delete'),
    ('public', 'website_blog_slug_redirects', 'website_blog_slug_redirects_admin_read')
)
select 'column' as object_type,
       format('%I.%I.%I', schema_name, table_name, column_name) as object_name,
       exists (
         select 1 from information_schema.columns c
         where c.table_schema = expected_columns.schema_name
           and c.table_name = expected_columns.table_name
           and c.column_name = expected_columns.column_name
       ) as present,
       null::text as detail
from expected_columns
union all
select 'table', format('%I.%I', schema_name, table_name),
       to_regclass(format('%I.%I', schema_name, table_name)) is not null,
       case when cls.relname is not null then 'rls=' || cls.relrowsecurity::text end
from expected_tables
left join pg_class cls on cls.oid = to_regclass(format('%I.%I', schema_name, table_name))
union all
select 'constraint', format('%I.%I.%I', schema_name, table_name, constraint_name),
       exists (
         select 1 from pg_constraint con
         where con.conrelid = to_regclass(format('%I.%I', schema_name, table_name))
           and con.conname = expected_constraints.constraint_name
       ), null::text
from expected_constraints
union all
select 'function', signature,
       to_regprocedure(signature) is not null,
       case when to_regprocedure(signature) is not null
         then 'definition_md5=' || md5(pg_get_functiondef(to_regprocedure(signature))) end
from expected_functions
union all
select 'trigger', format('%I.%I.%I', schema_name, table_name, trigger_name),
       exists (
         select 1 from pg_trigger trg
         where trg.tgrelid = to_regclass(format('%I.%I', schema_name, table_name))
           and trg.tgname = expected_triggers.trigger_name
           and not trg.tgisinternal
       ), null::text
from expected_triggers
union all
select 'policy', format('%I.%I.%I', schema_name, table_name, policy_name),
       exists (
         select 1 from pg_policies p
         where p.schemaname = expected_policies.schema_name
           and p.tablename = expected_policies.table_name
           and p.policyname = expected_policies.policy_name
       ), null::text
from expected_policies
union all
select 'storage_bucket', 'storage.buckets.website-media',
       exists (select 1 from storage.buckets where id = 'website-media'),
       null::text
order by object_type, object_name;
