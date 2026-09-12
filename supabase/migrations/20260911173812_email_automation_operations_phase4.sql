begin;

-- An organisation-scoped, RLS-respecting operational read model. It exposes
-- aggregate health only; contact details remain in the existing protected
-- enrolment and delivery tables.
create or replace view public.email_automation_journey_health
with (security_invoker = true) as
select
  j.organisation_id,
  j.id as journey_id,
  count(e.id)::integer as enrolled,
  count(e.id) filter (where e.status in ('queued', 'waiting', 'processing'))::integer as in_progress,
  count(e.id) filter (where e.status = 'completed')::integer as completed,
  count(e.id) filter (where e.status = 'failed')::integer as failed_enrolments,
  count(d.id) filter (where d.status = 'queued')::integer as queued_deliveries,
  count(d.id) filter (where d.status in ('sent', 'delivered', 'opened', 'clicked'))::integer as sent,
  count(d.id) filter (where d.status in ('delivered', 'opened', 'clicked'))::integer as delivered,
  count(d.id) filter (where d.status in ('opened', 'clicked'))::integer as opened,
  count(d.id) filter (where d.status = 'clicked')::integer as clicked,
  count(d.id) filter (where d.status = 'bounced')::integer as bounced,
  count(d.id) filter (where d.status = 'complained')::integer as complained,
  count(d.id) filter (where d.status = 'suppressed')::integer as suppressed,
  count(d.id) filter (where d.status = 'failed')::integer as failed_deliveries,
  max(e.created_at) as last_enrolled_at,
  max(d.sent_at) as last_sent_at
from public.email_automation_journeys j
left join public.email_automation_enrolments e on e.journey_id = j.id
left join public.email_automation_deliveries d on d.enrolment_id = e.id
group by j.organisation_id, j.id;

grant select on public.email_automation_journey_health to authenticated;

commit;
