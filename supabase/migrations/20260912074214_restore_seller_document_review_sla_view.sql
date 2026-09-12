begin;

-- The compatibility schema repair already supplies the SLA columns and
-- constraint. Restore only the missing invoker-safe read model so release
-- readiness can inspect document-review timing without bypassing RLS.
create or replace view public.seller_document_review_sla_v1
with (security_invoker = true)
as
select
  document.id as document_id,
  document.private_listing_id,
  listing.organisation_id,
  listing.assigned_agent_id,
  document.requirement_id,
  requirement.requirement_key,
  requirement.requirement_name,
  document.document_name,
  document.status,
  document.uploaded_at,
  document.review_started_at,
  document.review_due_at,
  document.review_sla_revision,
  document.review_sla_level,
  document.review_sla_escalated_at,
  extract(epoch from (now() - coalesce(document.uploaded_at, document.created_at))) / 3600.0 as review_age_hours,
  extract(epoch from (document.review_due_at - now())) / 3600.0 as hours_until_due,
  case
    when listing.assigned_agent_id is null then 'unassigned'
    when document.status not in ('uploaded','under_review') then 'resolved'
    when now() >= document.review_due_at + interval '48 hours' then 'critical'
    when now() >= document.review_due_at then 'breached'
    when now() >= document.review_due_at - interval '24 hours' then 'due_soon'
    else 'on_track'
  end as sla_state,
  coalesce(alerts.failed_notification_count, 0) as failed_notification_count,
  alerts.last_alert_at
from public.private_listing_documents document
join public.private_listings listing on listing.id = document.private_listing_id
left join public.private_listing_document_requirements requirement on requirement.id = document.requirement_id
left join lateral (
  select count(*) filter (where event.status = 'failed')::integer as failed_notification_count,
         max(event.created_at) as last_alert_at
  from public.notification_events event
  where event.organisation_id = listing.organisation_id
    and event.payload_json->>'documentId' = document.id::text
    and event.automation_key in (
      'seller_document_review_sla_warning',
      'seller_document_review_sla_breach',
      'seller_document_review_sla_critical'
    )
) alerts on true;

grant select on public.seller_document_review_sla_v1 to authenticated;
notify pgrst, 'reload schema';

commit;
