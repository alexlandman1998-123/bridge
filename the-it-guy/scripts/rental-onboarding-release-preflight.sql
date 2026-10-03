-- Read-only catalog checks. Run against the explicitly approved release target.
-- Before release, missing new objects/history are expected; after release none may be missing.
with expected(version) as (values ('20261003071610'),('20261003072828'),('20261003075136'),('20261003080507'),('20261003090506'))
select e.version,(h.version is not null) applied from expected e left join supabase_migrations.schema_migrations h on h.version=e.version order by e.version;
with expected(name) as (values ('rental_onboarding_checklists'),('rental_onboarding_requirements'),('rental_onboarding_checklist_revisions'),('rental_onboarding_evidence_assignments'),('rental_landlord_onboarding'),('rental_landlord_onboarding_documents'),('rental_landlord_onboarding_access'),('rental_landlord_onboarding_events'))
select e.name,c.oid is not null present,coalesce(c.relrowsecurity,false) rls_enabled from expected e left join pg_class c on c.relname=e.name and c.relnamespace='public'::regnamespace;
with expected(name) as (values ('rental_landlord_onboarding_snapshot'),('rental_landlord_onboarding_command'),('rental_landlord_onboarding_link_property'))
select e.name,p.oid is not null present,p.prosecdef security_definer,p.proconfig,
 coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) anon_execute,
 coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) client_execute,
 coalesce(has_function_privilege('service_role',p.oid,'EXECUTE'),false) server_execute
from expected e left join pg_proc p on p.proname=e.name and p.pronamespace='public'::regnamespace;
with expected(name) as (values ('rental_onboarding_requirement_summaries'),('rental_application_review_summaries'))
select e.name,c.oid is not null present,c.reloptions from expected e left join pg_class c on c.relname=e.name and c.relnamespace='public'::regnamespace;
with expected(id) as (values ('rental-landlord-onboarding'),('rental-application-documents'))
select e.id,b.id is not null present,b.public,b.file_size_limit,b.allowed_mime_types from expected e left join storage.buckets b on b.id=e.id;
select table_name,column_name from information_schema.columns where table_schema='public' and table_name in ('leads','private_listings','rental_properties') and column_name in ('id','lead_id','organisation_id','branch_id','assigned_agent_id','assigned_user_id') order by table_name,column_name;
with expected(name) as (values ('trg_rental_mandate_disclosure_gate'),('trg_rental_landlord_discovery_guard'),('trg_rental_landlord_zz_collection_saved'))
select e.name,t.oid is not null present,t.tgenabled from expected e left join pg_trigger t on t.tgname=e.name and not t.tgisinternal;
-- Do not run transition/upload RPCs as a preflight: those write records.
