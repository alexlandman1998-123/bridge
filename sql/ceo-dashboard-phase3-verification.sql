-- Run after 202607150016_ceo_dashboard_phase3.sql has been deployed.

select
  to_regprocedure('public.arch9_admin_ceo_lead_workflow_v1(uuid)') is not null as lead_workflow_rpc_exists,
  to_regprocedure('public.arch9_admin_update_demo_enquiry_v1(uuid,jsonb)') is not null as audited_update_rpc_exists;

select
  has_function_privilege('authenticated', 'public.arch9_admin_ceo_lead_workflow_v1(uuid)', 'execute') as authenticated_can_load_workflow,
  has_function_privilege('authenticated', 'public.arch9_admin_update_demo_enquiry_v1(uuid,jsonb)', 'execute') as authenticated_can_update_workflow,
  not has_function_privilege('anon', 'public.arch9_admin_ceo_lead_workflow_v1(uuid)', 'execute') as anon_cannot_load_workflow,
  not has_function_privilege('anon', 'public.arch9_admin_update_demo_enquiry_v1(uuid,jsonb)', 'execute') as anon_cannot_update_workflow;

select
  p.proname,
  p.prosecdef as security_definer,
  p.provolatile = 's' as stable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('arch9_admin_ceo_lead_workflow_v1', 'arch9_admin_update_demo_enquiry_v1')
order by p.proname;
