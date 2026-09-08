-- Read-only deployment preflight. Run against the verified Arch9 Staging project,
-- never use this metadata result as proof of authenticated browser/RLS behaviour.
select
  to_regprocedure('public.bridge_update_attorney_workflow_step_v2(uuid,text,uuid,text,text,text,jsonb)') is not null as task_rpc_v2_present,
  to_regprocedure('public.bridge_update_attorney_workflow_step_v3(uuid,text,uuid,text,text,text,jsonb)') is not null as task_rpc_v3_present,
  to_regprocedure('public.bridge_reconcile_attorney_lane_progress_with_matter_plan(uuid,text,text,text)') is not null as plan_reconciliation_present,
  to_regprocedure('public.bridge_can_mutate_attorney_lane(uuid,text,text)') is not null as lane_permission_helper,
  to_regprocedure('public.bridge_attorney_step_to_matter_stage(text,text)') is not null as stage_mapper,
  (select coalesce(jsonb_agg(version order by version), '[]'::jsonb)
   from supabase_migrations.schema_migrations
   where version in ('20260908071547', '20260908073924')) as applied_mvp_versions,
  (select count(*) from public.demo_seed_manifests
   where environment = 'staging' and demo_key = 'attorney-demo-full-workflows-v1') as attorney_fixture_manifests;
