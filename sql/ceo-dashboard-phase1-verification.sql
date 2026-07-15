-- Read-only production/staging verification for Arch9 Command CEO Phase 1.
-- Run after 202607150014_ceo_dashboard_phase1.sql has been applied.

select
  sales_stage,
  priority,
  count(*) as enquiry_count,
  count(*) filter (where assigned_to_user_id is null) as unassigned_count
from public.demo_enquiries
group by sales_stage, priority
order by sales_stage, priority;

select
  source_type,
  status,
  count(*) as event_count,
  coalesce(sum(amount_cents), 0) as amount_cents,
  min(recognised_at) as first_recognised_at,
  max(recognised_at) as last_recognised_at
from public.platform_revenue_events
group by source_type, status
order by source_type nulls last, status;

select
  invoice.id,
  invoice.invoice_number,
  invoice.amount,
  invoice.paid_at
from public.billing_invoices invoice
left join public.platform_revenue_events event
  on event.source_type = 'billing_invoice'
 and event.source_id = invoice.id
where invoice.status = 'paid'
  and invoice.amount > 0
  and event.id is null
order by invoice.paid_at desc nulls last;

select
  month_start,
  target_amount_cents,
  currency,
  updated_at
from public.platform_revenue_targets
order by month_start desc, currency;

-- The CLI verification role is intentionally not a platform admin, so it must
-- not invoke the guarded RPC. Verify registration and grants here; exercise
-- the response separately through an authenticated Arch9 executive session.
select
  p.proname,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'arch9_admin_ceo_dashboard_v1',
    'arch9_admin_set_revenue_target_v1',
    'arch9_admin_update_demo_enquiry_v1'
  )
order by p.proname;
