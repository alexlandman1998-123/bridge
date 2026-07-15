-- Read-only production readiness checks for the Phase 5 CEO dashboard.

select
  to_regprocedure('public.arch9_admin_ceo_dashboard_v1(timestamp with time zone,timestamp with time zone)') is not null as dashboard_rpc_exists,
  to_regprocedure('public.arch9_admin_ceo_lead_workflow_v1(uuid)') is not null as lead_workflow_rpc_exists,
  to_regprocedure('public.arch9_admin_update_demo_enquiry_v1(uuid,jsonb)') is not null as lead_update_rpc_exists,
  to_regprocedure('public.arch9_admin_set_revenue_target_v1(date,bigint,text,text)') is not null as target_rpc_exists;

select
  count(*) filter (where status in ('recognised', 'recognized') and currency = 'ZAR') as recognised_revenue_events,
  max(recognised_at) filter (where status in ('recognised', 'recognized') and currency = 'ZAR') as latest_recognised_revenue,
  count(*) filter (where source_type = 'billing_invoice') as billing_invoice_events
from public.platform_revenue_events;

select
  count(*) filter (where sales_stage not in ('won', 'lost', 'closed', 'spam')) as open_intake_leads,
  count(*) filter (where sales_stage = 'new' and assigned_to_user_id is null and created_at < now() - interval '4 hours') as overdue_unassigned_leads,
  max(updated_at) as latest_lead_update
from public.demo_enquiries;

select
  month_start,
  target_amount_cents,
  currency,
  updated_at
from public.platform_revenue_targets
where month_start >= date_trunc('month', now())::date - interval '2 months'
order by month_start desc;
