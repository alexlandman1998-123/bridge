-- Read-only checks after 202607160007_admin_intake_launch_assurance_phase6.sql.

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'demo_enquiries'
  and indexname = 'demo_enquiries_notification_recovery_idx';

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.demo_enquiry_activity_events'::regclass
  and conname = 'demo_enquiry_activity_events_type_check';

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'arch9_admin_intake_pipeline_health_v1';

select grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name = 'arch9_admin_intake_pipeline_health_v1'
order by grantee;

