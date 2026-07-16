begin;

-- Admin CRM intake leads Phase 6
-- Adds launch health telemetry and a recoverable notification queue.

alter table public.demo_enquiry_activity_events
  drop constraint if exists demo_enquiry_activity_events_type_check;
alter table public.demo_enquiry_activity_events
  add constraint demo_enquiry_activity_events_type_check
  check (event_type in ('workflow_updated', 'duplicate_reviewed', 'conversion_linked', 'notification_retried'));

create index if not exists demo_enquiries_notification_recovery_idx
  on public.demo_enquiries (notification_status, created_at asc)
  where notification_status in ('pending', 'failed', 'skipped');

create or replace function public.arch9_admin_intake_pipeline_health_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.bridge_is_platform_admin() then
    raise exception 'Admin intake health access is required.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'version', 1,
    'status', case
      when count(*) filter (where notification_status = 'failed') > 0 then 'attention'
      when count(*) filter (
        where notification_status = 'pending'
          and created_at < now() - interval '15 minutes'
      ) > 0 then 'degraded'
      else 'healthy'
    end,
    'submissions24h', count(*) filter (where created_at >= now() - interval '24 hours'),
    'new24h', count(*) filter (
      where created_at >= now() - interval '24 hours'
        and sales_stage = 'new'
    ),
    'possibleDuplicates24h', count(*) filter (
      where created_at >= now() - interval '24 hours'
        and dedupe_status = 'possible_duplicate'
    ),
    'consented24h', count(*) filter (
      where created_at >= now() - interval '24 hours'
        and popia_consent_given
    ),
    'failedNotifications', count(*) filter (where notification_status = 'failed'),
    'pendingNotifications', count(*) filter (where notification_status = 'pending'),
    'skippedNotifications', count(*) filter (where notification_status = 'skipped'),
    'oldestPendingAt', min(created_at) filter (where notification_status = 'pending'),
    'lastSubmissionAt', max(created_at),
    'lastNotificationAt', max(notified_at),
    'checkedAt', now()
  ) into v_result
  from public.demo_enquiries;

  return v_result;
end;
$$;

revoke all on function public.arch9_admin_intake_pipeline_health_v1() from public, anon, authenticated, service_role;
grant execute on function public.arch9_admin_intake_pipeline_health_v1() to authenticated;

commit;

