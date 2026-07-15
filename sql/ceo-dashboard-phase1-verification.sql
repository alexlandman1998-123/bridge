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

-- Run through an authenticated platform-admin session. The response should
-- reconcile with the source queries above and should return null, not zero,
-- when recognised revenue or a monthly target is genuinely unavailable.
select public.arch9_admin_ceo_dashboard_v1(
  date_trunc('month', now()),
  now()
);
