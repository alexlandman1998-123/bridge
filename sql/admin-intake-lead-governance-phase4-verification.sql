-- Read-only checks after 202607160005_admin_intake_lead_governance_phase4.sql.

select to_regclass('public.demo_enquiry_activity_events') as activity_table;

select trigger_name, event_manipulation, action_timing
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'demo_enquiries'
  and trigger_name = 'trg_bridge_log_demo_enquiry_activity_v1';

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'arch9_admin_intake_lead_context_v1',
    'arch9_admin_review_intake_lead_duplicate_v1'
  )
order by routine_name;

select grantee, routine_name, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in (
    'arch9_admin_intake_lead_context_v1',
    'arch9_admin_review_intake_lead_duplicate_v1'
  )
order by routine_name, grantee;

