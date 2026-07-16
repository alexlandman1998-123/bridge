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
) values (
  'attorney_client_financial_document_reminder',
  'Published financial document view reminder',
  'reminder',
  'scheduled_reminder',
  null,
  array['in_app']::text[],
  'active',
  true,
  'publication_event_reminder_number',
  '{"cadenceDays":[3,7],"stopWhen":"document_viewed","escalation":{"enabled":true,"afterDay":10,"recipientRole":"attorney"},"tone":"premium_professional"}'::jsonb,
  '{"module":"attorney_client_financial_documents","phase":6}'::jsonb
)
on conflict (automation_key) do update
set display_name = excluded.display_name,
    channels = excluded.channels,
    implementation_status = excluded.implementation_status,
    default_enabled = excluded.default_enabled,
    dedupe_strategy = excluded.dedupe_strategy,
    reminder_policy = excluded.reminder_policy,
    metadata_json = coalesce(public.notification_automation_definitions.metadata_json, '{}'::jsonb) || excluded.metadata_json,
    updated_at = now();

create table if not exists public.attorney_client_financial_document_reminder_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  publication_event_id uuid not null references public.attorney_client_financial_document_publication_events(id) on delete cascade,
  document_definition_key text not null references public.document_definitions(key) on update cascade on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  recipient_role text not null check (recipient_role in ('buyer', 'seller')),
  reminder_kind text not null check (reminder_kind in ('manual', 'scheduled')),
  reminder_number integer not null check (reminder_number > 0),
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'delivered', 'failed', 'skipped')),
  client_notification_id uuid references public.client_portal_notifications(id) on delete set null,
  notification_event_id uuid references public.notification_events(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint attorney_client_financial_reminder_once
    unique (publication_event_id, reminder_kind, reminder_number)
);

create index if not exists attorney_client_financial_reminder_events_scope_idx
  on public.attorney_client_financial_document_reminder_events (
    organisation_id,
    attorney_firm_id,
    transaction_id,
    document_definition_key,
    created_at desc
  );

alter table public.attorney_client_financial_document_reminder_events enable row level security;

drop policy if exists attorney_client_financial_reminder_events_select
  on public.attorney_client_financial_document_reminder_events;
create policy attorney_client_financial_reminder_events_select
on public.attorney_client_financial_document_reminder_events
for select to authenticated
using (
  public.bridge_conveyancer_can_access_record(organisation_id, attorney_firm_id, transaction_id)
);

revoke all on public.attorney_client_financial_document_reminder_events from public, anon;
grant select on public.attorney_client_financial_document_reminder_events to authenticated;
grant all on public.attorney_client_financial_document_reminder_events to service_role;

create or replace function public.bridge_deliver_attorney_client_financial_document_reminder(
  p_publication_event_id uuid,
  p_reminder_kind text,
  p_reminder_number integer,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_publication public.attorney_client_financial_document_publication_events%rowtype;
  v_metadata public.transaction_attorney_client_financial_document_metadata%rowtype;
  v_reminder public.attorney_client_financial_document_reminder_events%rowtype;
  v_label text;
  v_title text;
  v_description text;
  v_dedupe_key text;
  v_client_notification_id uuid;
  v_notification_event_id uuid;
begin
  select * into v_publication
  from public.attorney_client_financial_document_publication_events
  where id = p_publication_event_id
    and action = 'published';
  if v_publication.id is null then
    raise exception 'Published financial document event is required.' using errcode = '22023';
  end if;

  select * into v_metadata
  from public.transaction_attorney_client_financial_document_metadata
  where transaction_id = v_publication.transaction_id
    and document_definition_key = v_publication.document_definition_key
    and document_id = v_publication.document_id
    and recipient_role = v_publication.recipient_role
    and publication_status = 'published';
  if v_metadata.id is null then
    raise exception 'The document is no longer published.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.attorney_client_financial_document_access_events access_event
    where access_event.publication_event_id = v_publication.id
      and access_event.recipient_role = v_publication.recipient_role
      and access_event.event_type = 'viewed'
  ) then
    raise exception 'The client has already viewed this document.' using errcode = '22023';
  end if;

  insert into public.attorney_client_financial_document_reminder_events (
    organisation_id,
    attorney_firm_id,
    transaction_id,
    publication_event_id,
    document_definition_key,
    document_id,
    recipient_role,
    reminder_kind,
    reminder_number,
    actor_user_id
  ) values (
    v_publication.organisation_id,
    v_publication.attorney_firm_id,
    v_publication.transaction_id,
    v_publication.id,
    v_publication.document_definition_key,
    v_publication.document_id,
    v_publication.recipient_role,
    lower(trim(p_reminder_kind)),
    p_reminder_number,
    p_actor_user_id
  )
  on conflict (publication_event_id, reminder_kind, reminder_number) do nothing
  returning * into v_reminder;

  if v_reminder.id is null then
    select * into v_reminder
    from public.attorney_client_financial_document_reminder_events
    where publication_event_id = v_publication.id
      and reminder_kind = lower(trim(p_reminder_kind))
      and reminder_number = p_reminder_number;
    return to_jsonb(v_reminder);
  end if;

  v_label := case v_publication.document_definition_key
    when 'buyer_transfer_cost_invoice' then 'transfer cost invoice'
    when 'seller_attorney_invoice' then 'attorney invoice'
    when 'buyer_final_statement' then 'final statement'
    when 'seller_final_statement' then 'final statement'
    else 'financial document'
  end;
  v_title := 'Reminder: ' || initcap(v_label) || ' ready to view';
  v_description := 'Your ' || v_label || ' is still available in Documents. Please open it when convenient.';
  v_dedupe_key := 'attorney_financial_reminder:' || v_publication.id::text || ':' || lower(trim(p_reminder_kind)) || ':' || p_reminder_number::text;

  insert into public.client_portal_notifications (
    transaction_id,
    client_role,
    notification_type,
    title,
    description,
    priority,
    status,
    related_entity_type,
    related_entity_id,
    action_label,
    action_route,
    visibility,
    metadata,
    dedupe_key
  ) values (
    v_publication.transaction_id,
    v_publication.recipient_role,
    'document_reminder',
    v_title,
    v_description,
    'normal',
    'unread',
    'attorney_client_financial_document',
    v_publication.document_id,
    'View document',
    'documents',
    'client_visible',
    jsonb_build_object(
      'documentDefinitionKey', v_publication.document_definition_key,
      'documentId', v_publication.document_id,
      'publicationEventId', v_publication.id,
      'recipientRole', v_publication.recipient_role,
      'reminderNumber', p_reminder_number,
      'source', 'attorney_client_financial_documents'
    ),
    v_dedupe_key
  ) returning id into v_client_notification_id;

  insert into public.notification_events (
    automation_key,
    organisation_id,
    transaction_id,
    event_key,
    category,
    trigger_type,
    channel,
    status,
    recipient_role,
    subject,
    message_preview,
    source,
    dedupe_key,
    payload_json,
    metadata_json,
    prepared_at,
    queued_at,
    sent_at,
    delivered_at
  ) values (
    'attorney_client_financial_document_reminder',
    v_publication.organisation_id,
    v_publication.transaction_id,
    'attorney_client_financial_document_reminder',
    'reminder',
    case when lower(trim(p_reminder_kind)) = 'manual' then 'manual_send' else 'scheduled_reminder' end,
    'in_app',
    'delivered',
    v_publication.recipient_role,
    v_title,
    v_description,
    'attorney_client_financial_documents',
    v_dedupe_key,
    jsonb_build_object(
      'publicationEventId', v_publication.id,
      'documentDefinitionKey', v_publication.document_definition_key,
      'documentId', v_publication.document_id,
      'reminderNumber', p_reminder_number
    ),
    jsonb_build_object(
      'clientNotificationId', v_client_notification_id,
      'attorneyFirmId', v_publication.attorney_firm_id,
      'reminderKind', lower(trim(p_reminder_kind))
    ),
    now(),
    now(),
    now(),
    now()
  ) returning id into v_notification_event_id;

  update public.attorney_client_financial_document_reminder_events
  set client_notification_id = v_client_notification_id,
      notification_event_id = v_notification_event_id,
      delivery_status = 'delivered'
  where id = v_reminder.id
  returning * into v_reminder;

  return to_jsonb(v_reminder);
end;
$$;

revoke all on function public.bridge_deliver_attorney_client_financial_document_reminder(uuid, text, integer, uuid)
  from public, anon, authenticated;

create or replace function public.bridge_send_attorney_client_financial_document_reminder(
  p_organisation_id uuid,
  p_attorney_firm_id uuid,
  p_transaction_id uuid,
  p_document_definition_key text,
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_document_definition_key, '')));
  v_role text;
  v_publication_event_id uuid;
  v_reminder_number integer;
begin
  if auth.role() <> 'authenticated' or auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not public.bridge_conveyancer_can_access_record(p_organisation_id, p_attorney_firm_id, p_transaction_id) then
    raise exception 'Matter access denied.' using errcode = '42501';
  end if;

  select member.role into v_role
  from public.attorney_firm_members member
  where member.firm_id = p_attorney_firm_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  limit 1;
  if v_role not in ('firm_admin', 'director_partner', 'transfer_attorney', 'conveyancing_secretary') then
    raise exception 'Client reminder authority is required.' using errcode = '42501';
  end if;

  select publication_event.id into v_publication_event_id
  from public.attorney_client_financial_document_publication_events publication_event
  join public.transaction_attorney_client_financial_document_metadata metadata
    on metadata.transaction_id = publication_event.transaction_id
   and metadata.document_definition_key = publication_event.document_definition_key
   and metadata.document_id = publication_event.document_id
   and metadata.recipient_role = publication_event.recipient_role
   and metadata.publication_status = 'published'
  where publication_event.organisation_id = p_organisation_id
    and publication_event.attorney_firm_id = p_attorney_firm_id
    and publication_event.transaction_id = p_transaction_id
    and publication_event.document_definition_key = v_key
    and publication_event.document_id = p_document_id
    and publication_event.action = 'published'
    and publication_event.created_at >= coalesce(metadata.published_at, '-infinity'::timestamptz)
  order by publication_event.created_at desc
  limit 1;
  if v_publication_event_id is null then
    raise exception 'An active published document is required.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.attorney_client_financial_document_reminder_events reminder
    where reminder.publication_event_id = v_publication_event_id
      and reminder.created_at > now() - interval '24 hours'
  ) then
    raise exception 'A reminder was already sent in the last 24 hours.' using errcode = '22023';
  end if;

  select coalesce(max(reminder.reminder_number), 0) + 1 into v_reminder_number
  from public.attorney_client_financial_document_reminder_events reminder
  where reminder.publication_event_id = v_publication_event_id
    and reminder.reminder_kind = 'manual';

  return public.bridge_deliver_attorney_client_financial_document_reminder(
    v_publication_event_id,
    'manual',
    v_reminder_number,
    auth.uid()
  );
end;
$$;

revoke all on function public.bridge_send_attorney_client_financial_document_reminder(uuid, uuid, uuid, text, uuid)
  from public, anon;
grant execute on function public.bridge_send_attorney_client_financial_document_reminder(uuid, uuid, uuid, text, uuid)
  to authenticated;

create or replace function public.bridge_queue_attorney_client_financial_document_reminders(
  p_limit integer default 100,
  p_now timestamptz default now(),
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate record;
  v_limit integer := greatest(0, least(coalesce(p_limit, 100), 500));
  v_now timestamptz := coalesce(p_now, now());
  v_candidates integer := 0;
  v_queued integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;

  for v_candidate in
    select publication_event.id as publication_event_id, cadence.reminder_number
    from public.transaction_attorney_client_financial_document_metadata metadata
    join lateral (
      select event.*
      from public.attorney_client_financial_document_publication_events event
      where event.transaction_id = metadata.transaction_id
        and event.document_definition_key = metadata.document_definition_key
        and event.document_id = metadata.document_id
        and event.recipient_role = metadata.recipient_role
        and event.action = 'published'
        and event.created_at >= coalesce(metadata.published_at, '-infinity'::timestamptz)
      order by event.created_at desc
      limit 1
    ) publication_event on true
    cross join (values (1, 3), (2, 7)) as cadence(reminder_number, cadence_day)
    where metadata.publication_status = 'published'
      and metadata.published_at <= v_now - make_interval(days => cadence.cadence_day)
      and not exists (
        select 1
        from public.attorney_client_financial_document_access_events access_event
        where access_event.publication_event_id = publication_event.id
          and access_event.recipient_role = metadata.recipient_role
          and access_event.event_type = 'viewed'
      )
      and not exists (
        select 1
        from public.attorney_client_financial_document_reminder_events reminder
        where reminder.publication_event_id = publication_event.id
          and reminder.reminder_kind = 'scheduled'
          and reminder.reminder_number = cadence.reminder_number
      )
    order by metadata.published_at, cadence.reminder_number
    limit v_limit
  loop
    v_candidates := v_candidates + 1;
    if not coalesce(p_dry_run, false) then
      perform public.bridge_deliver_attorney_client_financial_document_reminder(
        v_candidate.publication_event_id,
        'scheduled',
        v_candidate.reminder_number,
        null
      );
      v_queued := v_queued + 1;
    end if;
  end loop;

  return jsonb_build_object('candidates', v_candidates, 'queued', v_queued, 'dryRun', coalesce(p_dry_run, false), 'processedAt', v_now);
end;
$$;

revoke all on function public.bridge_queue_attorney_client_financial_document_reminders(integer, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.bridge_queue_attorney_client_financial_document_reminders(integer, timestamptz, boolean)
  to service_role;

comment on table public.attorney_client_financial_document_reminder_events is
  'Phase 6 audit ledger for manual and scheduled buyer/seller financial document view reminders.';
comment on function public.bridge_queue_attorney_client_financial_document_reminders(integer, timestamptz, boolean) is
  'Queues idempotent day-3 and day-7 in-app reminders and stops once the active publication has a view receipt.';

notify pgrst, 'reload schema';

commit;
