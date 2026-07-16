begin;

insert into public.notification_automation_definitions (
  automation_key,
  display_name,
  category,
  trigger_type,
  recipient_role,
  channels,
  implementation_status,
  default_enabled,
  dedupe_strategy,
  reminder_policy,
  metadata_json
)
values
  (
    'attorney_lead_created',
    'Attorney Lead created',
    'notification',
    'system_event',
    'attorney',
    array['in_app']::text[],
    'active',
    true,
    'lead_recipient_created',
    '{}'::jsonb,
    '{"domain":"attorney_lead","phase":"phase_9"}'::jsonb
  ),
  (
    'attorney_lead_assigned',
    'Attorney Lead assigned',
    'notification',
    'system_event',
    'attorney',
    array['in_app']::text[],
    'active',
    true,
    'lead_recipient_assignment',
    '{}'::jsonb,
    '{"domain":"attorney_lead","phase":"phase_9"}'::jsonb
  ),
  (
    'attorney_lead_follow_up_due',
    'Attorney Lead follow-up due',
    'reminder',
    'scheduled_reminder',
    'attorney',
    array['in_app']::text[],
    'active',
    true,
    'lead_recipient_follow_up_at',
    '{"cadence":"once_per_follow_up_timestamp"}'::jsonb,
    '{"domain":"attorney_lead","phase":"phase_9"}'::jsonb
  ),
  (
    'attorney_lead_first_contact_overdue',
    'Attorney Lead first contact overdue',
    'reminder',
    'scheduled_reminder',
    'attorney',
    array['in_app']::text[],
    'active',
    true,
    'lead_recipient_first_contact_sla',
    '{"afterHours":24,"cadence":"once_per_lead"}'::jsonb,
    '{"domain":"attorney_lead","phase":"phase_9"}'::jsonb
  )
on conflict (automation_key) do update
set display_name = excluded.display_name,
    category = excluded.category,
    trigger_type = excluded.trigger_type,
    recipient_role = excluded.recipient_role,
    channels = excluded.channels,
    implementation_status = excluded.implementation_status,
    default_enabled = excluded.default_enabled,
    dedupe_strategy = excluded.dedupe_strategy,
    reminder_policy = excluded.reminder_policy,
    metadata_json = coalesce(public.notification_automation_definitions.metadata_json, '{}'::jsonb) || excluded.metadata_json,
    updated_at = now();

create or replace function public.bridge_attorney_lead_notification_recipient(
  p_organisation_id uuid,
  p_preferred_user_id uuid default null
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select member.user_id, 0 as priority
    from public.organisation_users member
    where member.organisation_id = p_organisation_id
      and member.user_id = p_preferred_user_id
      and lower(trim(coalesce(member.membership_status, member.status, ''))) in ('active', 'accepted')
    union all
    select member.user_id, 1 as priority
    from public.organisation_users member
    where member.organisation_id = p_organisation_id
      and member.user_id is not null
      and lower(trim(coalesce(member.membership_status, member.status, ''))) in ('active', 'accepted')
      and lower(trim(coalesce(
        nullif(trim(member.organisation_role), ''),
        nullif(trim(member.workspace_role), ''),
        nullif(trim(member.role), ''),
        nullif(trim(member.app_role), ''),
        'viewer'
      ))) in ('owner', 'principal', 'partner', 'director', 'firm_admin', 'director_partner')
    union all
    select member.user_id, case when member.user_id = p_preferred_user_id then 0 else 2 end
    from public.attorney_firm_members member
    join public.attorney_firms firm on firm.id = member.firm_id
    where firm.organisation_id = p_organisation_id
      and member.status = 'active'
      and (
        member.user_id = p_preferred_user_id
        or member.role in ('firm_admin', 'director_partner')
      )
  )
  select candidate.user_id
  from candidates candidate
  join public.profiles profile on profile.id = candidate.user_id
  order by candidate.priority, candidate.user_id
  limit 1
$$;

revoke all on function public.bridge_attorney_lead_notification_recipient(uuid, uuid) from public, anon, authenticated;

create or replace function public.bridge_emit_attorney_lead_notification(
  p_organisation_id uuid,
  p_lead_id uuid,
  p_preferred_user_id uuid,
  p_automation_key text,
  p_title text,
  p_message text,
  p_dedupe_key text,
  p_source text default 'attorney_leads_phase9'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_event_id uuid;
  v_notification_id uuid;
begin
  if not exists (
    select 1 from public.leads lead
    where lead.lead_id = p_lead_id
      and lead.organisation_id = p_organisation_id
      and lead.lead_domain = 'attorney'
  ) then
    return jsonb_build_object('emitted', false, 'reason', 'lead_unavailable');
  end if;

  v_recipient := public.bridge_attorney_lead_notification_recipient(
    p_organisation_id, p_preferred_user_id
  );
  if v_recipient is null then
    return jsonb_build_object('emitted', false, 'reason', 'recipient_unavailable');
  end if;

  v_event_id := public.bridge_record_notification_event_phase2(
    p_automation_key,
    p_organisation_id,
    p_source,
    auth.uid(),
    v_recipient,
    'attorney',
    null,
    null,
    null,
    p_lead_id,
    null,
    left(coalesce(p_title, 'Attorney Lead update'), 200),
    left(coalesce(p_message, ''), 320),
    p_dedupe_key,
    jsonb_build_object(
      'leadId', p_lead_id,
      'actionRoute', '/attorney/leads',
      'entityLabel', 'Attorney Lead'
    ),
    jsonb_build_object('domain', 'attorney_lead', 'phase', 'phase_9')
  );

  v_notification_id := public.bridge_insert_invite_accepted_transaction_notification_phase2(
    null,
    v_recipient,
    'attorney',
    left(coalesce(p_title, 'Attorney Lead update'), 200),
    left(coalesce(p_message, ''), 1000),
    p_dedupe_key,
    jsonb_build_object(
      'leadId', p_lead_id,
      'actionRoute', '/attorney/leads',
      'entityLabel', 'Attorney Lead',
      'notificationDomain', 'attorney_lead',
      'automationKey', p_automation_key
    )
  );

  return jsonb_build_object(
    'emitted', v_event_id is not null or v_notification_id is not null,
    'recipient_user_id', v_recipient,
    'notification_event_id', v_event_id,
    'in_app_notification_id', v_notification_id
  );
end;
$$;

revoke all on function public.bridge_emit_attorney_lead_notification(uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;

-- Existing notification policies are transaction-spine based. Attorney Lead
-- alerts intentionally have no transaction yet, so permit only the addressed
-- user to read/acknowledge an alert whose Lead remains visible to that user.
drop policy if exists attorney_lead_notifications_select_phase9 on public.transaction_notifications;
create policy attorney_lead_notifications_select_phase9
on public.transaction_notifications
for select to authenticated
using (
  transaction_id is null
  and user_id = auth.uid()
  and event_data ->> 'notificationDomain' = 'attorney_lead'
  and exists (
    select 1 from public.leads lead
    where lead.lead_id::text = (transaction_notifications.event_data ->> 'leadId')
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'view'
      )
  )
);

drop policy if exists attorney_lead_notifications_update_phase9 on public.transaction_notifications;
create policy attorney_lead_notifications_update_phase9
on public.transaction_notifications
for update to authenticated
using (
  transaction_id is null
  and user_id = auth.uid()
  and event_data ->> 'notificationDomain' = 'attorney_lead'
  and exists (
    select 1 from public.leads lead
    where lead.lead_id::text = (transaction_notifications.event_data ->> 'leadId')
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'view'
      )
  )
)
with check (
  transaction_id is null
  and user_id = auth.uid()
  and event_data ->> 'notificationDomain' = 'attorney_lead'
  and exists (
    select 1 from public.leads lead
    where lead.lead_id::text = (transaction_notifications.event_data ->> 'leadId')
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'view'
      )
  )
);

grant select, update on public.transaction_notifications to authenticated;

create or replace function public.bridge_attorney_lead_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_domain <> 'attorney' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.bridge_emit_attorney_lead_notification(
      new.organisation_id,
      new.lead_id,
      new.assigned_user_id,
      'attorney_lead_created',
      'New Attorney Lead',
      'A new enquiry is ready for review in Attorney Leads.',
      'attorney_lead_created:' || new.lead_id::text,
      'attorney_lead_created'
    );
    return new;
  end if;

  if new.assigned_user_id is distinct from old.assigned_user_id
     and new.assigned_user_id is not null then
    perform public.bridge_emit_attorney_lead_notification(
      new.organisation_id,
      new.lead_id,
      new.assigned_user_id,
      'attorney_lead_assigned',
      'Attorney Lead assigned to you',
      'Open the Lead to review the enquiry and plan the next action.',
      'attorney_lead_assigned:' || new.lead_id::text || ':' || new.assigned_user_id::text,
      'attorney_lead_assignment'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.bridge_attorney_lead_notification_trigger() from public, anon, authenticated;

drop trigger if exists trg_attorney_lead_notifications_phase9 on public.leads;
create trigger trg_attorney_lead_notifications_phase9
after insert or update of assigned_user_id on public.leads
for each row execute function public.bridge_attorney_lead_notification_trigger();

create or replace function public.bridge_queue_attorney_lead_follow_up_reminders(
  p_limit integer default 100,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  v_result jsonb;
  v_scanned integer := 0;
  v_emitted integer := 0;
  v_skipped integer := 0;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Attorney Lead reminder sweep requires the service role';
  end if;
  if p_limit < 1 or p_limit > 500 then
    raise exception 'Reminder sweep limit must be between 1 and 500';
  end if;

  for candidate in
    with due_candidates as (
      select
        lead.organisation_id,
        lead.lead_id,
        lead.assigned_user_id,
        'attorney_lead_follow_up_due'::text as automation_key,
        'Attorney Lead follow-up due'::text as title,
        'A scheduled Lead follow-up is due. Open the Lead to record the outcome.'::text as message,
        'attorney_lead_follow_up_due:' || lead.lead_id::text || ':' ||
          extract(epoch from lead.next_follow_up_at)::bigint::text as dedupe_key,
        lead.next_follow_up_at as due_at
      from public.leads lead
      where lead.lead_domain = 'attorney'
        and lead.status = 'open'
        and lead.next_follow_up_at is not null
        and lead.next_follow_up_at <= p_now
      union all
      select
        lead.organisation_id,
        lead.lead_id,
        lead.assigned_user_id,
        'attorney_lead_first_contact_overdue',
        'Attorney Lead awaiting first contact',
        'This new Lead has waited more than 24 hours for first contact.',
        'attorney_lead_first_contact_overdue:' || lead.lead_id::text,
        lead.created_at + interval '24 hours'
      from public.leads lead
      where lead.lead_domain = 'attorney'
        and lead.status = 'open'
        and lead.stage = 'new'
        and lead.first_contacted_at is null
        and lead.created_at <= p_now - interval '24 hours'
    )
    select due.*
    from due_candidates due
    where not exists (
      select 1 from public.notification_events event
      where event.organisation_id = due.organisation_id
        and event.dedupe_key = due.dedupe_key
    )
    order by due.due_at asc
    limit p_limit
  loop
    v_scanned := v_scanned + 1;
    v_result := public.bridge_emit_attorney_lead_notification(
      candidate.organisation_id,
      candidate.lead_id,
      candidate.assigned_user_id,
      candidate.automation_key,
      candidate.title,
      candidate.message,
      candidate.dedupe_key,
      'attorney_lead_reminder_sweep'
    );
    if coalesce((v_result ->> 'emitted')::boolean, false) then
      v_emitted := v_emitted + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'checked_at', p_now,
    'scanned', v_scanned,
    'emitted', v_emitted,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.bridge_queue_attorney_lead_follow_up_reminders(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.bridge_queue_attorney_lead_follow_up_reminders(integer, timestamptz) to service_role;

comment on function public.bridge_queue_attorney_lead_follow_up_reminders(integer, timestamptz) is
  'Idempotent service-role sweep for due Attorney Lead follow-ups and the 24-hour first-contact SLA.';

commit;
