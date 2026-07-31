begin;

create extension if not exists pg_cron;

insert into public.notification_automation_definitions (
  automation_key, display_name, category, trigger_type, recipient_role,
  channels, implementation_status, default_enabled, dedupe_strategy,
  reminder_policy, metadata_json
) values
  (
    'legal_document_signing_sent',
    'Legal document sent for signing',
    'notification',
    'system_event',
    'agent',
    array['in_app']::text[],
    'active',
    true,
    'packet_version_signer_event',
    '{}'::jsonb,
    '{"phase":"legal_document_agent_notification_sequence","surface":"agent_inbox"}'::jsonb
  ),
  (
    'legal_document_signer_viewed',
    'Legal document signer viewed',
    'notification',
    'system_event',
    'agent',
    array['in_app']::text[],
    'active',
    true,
    'packet_version_signer_event',
    '{}'::jsonb,
    '{"phase":"legal_document_agent_notification_sequence","surface":"agent_inbox"}'::jsonb
  ),
  (
    'legal_document_signer_signed',
    'Legal document signer signed',
    'notification',
    'system_event',
    'agent',
    array['in_app']::text[],
    'active',
    true,
    'packet_version_signer_event',
    '{}'::jsonb,
    '{"phase":"legal_document_agent_notification_sequence","surface":"agent_inbox"}'::jsonb
  ),
  (
    'legal_document_signed_ready',
    'Signed legal document ready',
    'notification',
    'system_event',
    'agent',
    array['in_app']::text[],
    'active',
    true,
    'packet_version_final_artifact',
    '{}'::jsonb,
    '{"phase":"legal_document_agent_notification_sequence","surface":"agent_inbox"}'::jsonb
  ),
  (
    'legal_document_signing_reminder',
    'Legal document signing reminder',
    'reminder',
    'scheduled_reminder',
    'agent',
    array['in_app']::text[],
    'active',
    true,
    'packet_version_signer_day',
    '{"cadenceDays":[1,2],"recipientRole":"assigned_agent","stopWhen":"signer_signed"}'::jsonb,
    '{"phase":"legal_document_agent_notification_sequence","surface":"agent_inbox"}'::jsonb
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

create index if not exists notification_events_legal_document_agent_sequence_idx
  on public.notification_events(organisation_id, automation_key, assigned_user_id, created_at desc)
  where automation_key in (
    'legal_document_signing_sent',
    'legal_document_signer_viewed',
    'legal_document_signer_signed',
    'legal_document_signed_ready',
    'legal_document_signing_reminder'
  );

create unique index if not exists notification_events_legal_document_agent_dedupe_idx
  on public.notification_events(organisation_id, dedupe_key)
  where automation_key in (
    'legal_document_signing_sent',
    'legal_document_signer_viewed',
    'legal_document_signer_signed',
    'legal_document_signed_ready',
    'legal_document_signing_reminder'
  )
    and dedupe_key is not null;

create index if not exists transaction_notifications_legal_document_agent_sequence_idx
  on public.transaction_notifications(user_id, created_at desc)
  where event_data ->> 'notificationDomain' = 'legal_document';

create or replace function public.bridge_legal_document_notification_uuid_phase1(p_value text)
returns uuid
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(p_value, '')), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then nullif(trim(p_value), '')::uuid
    else null
  end;
$$;

create or replace function public.bridge_legal_document_notification_label_phase1(p_packet_type text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(nullif(trim(p_packet_type), ''), ''))
    when 'mandate' then 'mandate'
    when 'otp' then 'OTP'
    else 'legal document'
  end;
$$;

create or replace function public.bridge_legal_document_agent_context_phase1(
  p_packet_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns table(
  organisation_id uuid,
  transaction_id uuid,
  listing_id uuid,
  lead_id uuid,
  agent_user_id uuid,
  packet_type text,
  document_label text,
  action_path text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_transaction public.transactions%rowtype;
  v_listing public.private_listings%rowtype;
  v_lead public.leads%rowtype;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_source_context jsonb;
  v_transaction_id uuid;
  v_listing_id uuid;
  v_lead_id uuid;
  v_agent_user_id uuid;
begin
  select *
    into v_packet
  from public.document_packets
  where id = p_packet_id;

  if v_packet.id is null then
    return;
  end if;

  v_source_context := coalesce(v_packet.source_context_json, '{}'::jsonb) || v_payload;

  v_transaction_id := coalesce(
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_packet) ->> 'transaction_id'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'transactionId'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'transaction_id')
  );

  if v_transaction_id is not null then
    select *
      into v_transaction
    from public.transactions
    where id = v_transaction_id
    limit 1;
  end if;

  if v_transaction.id is null then
    select *
      into v_transaction
    from public.transactions transaction_row
    where to_jsonb(transaction_row) ->> 'mandate_packet_id' = p_packet_id::text
       or to_jsonb(transaction_row) ->> 'otp_packet_id' = p_packet_id::text
    order by updated_at desc nulls last, created_at desc nulls last
    limit 1;
  end if;

  v_transaction_id := coalesce(v_transaction.id, v_transaction_id);

  v_listing_id := coalesce(
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_transaction) ->> 'listing_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_packet) ->> 'listing_id'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'listingId'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'listing_id'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'privateListingId'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'private_listing_id')
  );

  if v_listing_id is not null then
    select *
      into v_listing
    from public.private_listings
    where id = v_listing_id
    limit 1;
  end if;

  if v_listing.id is null then
    select *
      into v_listing
    from public.private_listings
    where mandate_packet_id = p_packet_id
    order by updated_at desc nulls last, created_at desc nulls last
    limit 1;
  end if;

  v_listing_id := coalesce(v_listing.id, v_listing_id);

  v_lead_id := coalesce(
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_transaction) ->> 'originating_lead_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_transaction) ->> 'lead_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_listing) ->> 'seller_lead_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_listing) ->> 'originating_crm_lead_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_packet) ->> 'lead_id'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'leadId'),
    public.bridge_legal_document_notification_uuid_phase1(v_source_context ->> 'lead_id')
  );

  if v_lead_id is not null then
    select *
      into v_lead
    from public.leads
    where lead_id = v_lead_id
    limit 1;
  end if;

  v_agent_user_id := coalesce(
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_packet) ->> 'assigned_agent_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_packet) ->> 'assigned_user_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_transaction) ->> 'assigned_agent_id'),
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_transaction) ->> 'owner_user_id'),
    v_listing.assigned_agent_id,
    v_lead.assigned_agent_id,
    public.bridge_legal_document_notification_uuid_phase1(to_jsonb(v_packet) ->> 'created_by')
  );

  organisation_id := coalesce(v_packet.organisation_id, v_transaction.organisation_id, v_listing.organisation_id, v_lead.organisation_id);
  transaction_id := v_transaction_id;
  listing_id := v_listing_id;
  lead_id := v_lead_id;
  agent_user_id := v_agent_user_id;
  packet_type := lower(coalesce(nullif(trim(to_jsonb(v_packet) ->> 'packet_type'), ''), 'document'));
  document_label := public.bridge_legal_document_notification_label_phase1(packet_type);
  action_path := '/legal-documents/' || p_packet_id::text;
  return next;
end;
$$;

create or replace function public.bridge_emit_legal_document_agent_notification_phase1(
  p_automation_key text,
  p_packet_id uuid,
  p_packet_version_id uuid,
  p_signer_id uuid,
  p_title text,
  p_message text,
  p_dedupe_key text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context record;
  v_event_id uuid;
  v_transaction_notification_id uuid;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_title text := left(coalesce(nullif(trim(p_title), ''), 'Legal document update'), 200);
  v_message text := left(coalesce(nullif(trim(p_message), ''), 'A legal document needs attention.'), 1000);
  v_dedupe_key text := nullif(trim(coalesce(p_dedupe_key, '')), '');
begin
  if nullif(trim(coalesce(p_automation_key, '')), '') is null
     or p_packet_id is null
     or v_dedupe_key is null then
    return jsonb_build_object('emitted', false, 'reason', 'missing_required_input');
  end if;

  select *
    into v_context
  from public.bridge_legal_document_agent_context_phase1(p_packet_id, v_payload)
  limit 1;

  if v_context.organisation_id is null or v_context.agent_user_id is null then
    return jsonb_build_object('emitted', false, 'reason', 'missing_agent_context');
  end if;

  insert into public.notification_events (
    automation_key,
    organisation_id,
    assigned_user_id,
    lead_id,
    listing_id,
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
    sent_at
  ) values (
    p_automation_key,
    v_context.organisation_id,
    v_context.agent_user_id,
    v_context.lead_id,
    v_context.listing_id,
    v_context.transaction_id,
    p_automation_key,
    case when p_automation_key = 'legal_document_signing_reminder' then 'reminder' else 'notification' end,
    case when p_automation_key = 'legal_document_signing_reminder' then 'scheduled_reminder' else 'system_event' end,
    'in_app',
    'sent',
    'agent',
    v_title,
    left(v_message, 320),
    'legal_document_agent_notification_sequence',
    v_dedupe_key,
    v_payload || jsonb_strip_nulls(jsonb_build_object(
      'packetId', p_packet_id,
      'packetVersionId', p_packet_version_id,
      'signerId', p_signer_id,
      'transactionId', v_context.transaction_id,
      'listingId', v_context.listing_id,
      'leadId', v_context.lead_id,
      'documentLabel', v_context.document_label,
      'applicationPath', v_context.action_path,
      'actionRoute', v_context.action_path,
      'recipientUserId', v_context.agent_user_id
    )),
    jsonb_build_object(
      'phase', 'legal_document_agent_notification_sequence',
      'notificationDomain', 'legal_document'
    ),
    now(),
    now()
  )
  on conflict do nothing
  returning id into v_event_id;

  if to_regclass('public.transaction_notifications') is not null
     and not exists (
       select 1
       from public.transaction_notifications existing
       where existing.user_id = v_context.agent_user_id
         and existing.dedupe_key = v_dedupe_key
         and existing.is_read = false
     ) then
    insert into public.transaction_notifications (
      transaction_id,
      user_id,
      role_type,
      notification_type,
      title,
      message,
      is_read,
      read_at,
      dedupe_key,
      event_type,
      event_data
    ) values (
      v_context.transaction_id,
      v_context.agent_user_id,
      'agent',
      'workflow_updated',
      v_title,
      v_message,
      false,
      null,
      v_dedupe_key,
      'TransactionUpdated',
      v_payload || jsonb_strip_nulls(jsonb_build_object(
        'notificationDomain', 'legal_document',
        'automationKey', p_automation_key,
        'packetId', p_packet_id,
        'packetVersionId', p_packet_version_id,
        'signerId', p_signer_id,
        'transactionId', v_context.transaction_id,
        'listingId', v_context.listing_id,
        'leadId', v_context.lead_id,
        'documentLabel', v_context.document_label,
        'applicationPath', v_context.action_path,
        'actionRoute', v_context.action_path
      ))
    )
    returning id into v_transaction_notification_id;
  end if;

  return jsonb_build_object(
    'emitted', coalesce(v_event_id is not null, false) or coalesce(v_transaction_notification_id is not null, false),
    'notificationEventId', v_event_id,
    'transactionNotificationId', v_transaction_notification_id,
    'recipientUserId', v_context.agent_user_id
  );
exception
  when undefined_table or undefined_column or check_violation or foreign_key_violation then
    return jsonb_build_object('emitted', false, 'reason', sqlerrm);
end;
$$;

create or replace function public.bridge_legal_document_signer_agent_notification_phase1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet_type text;
  v_document_label text;
  v_signer_label text;
  v_signer_role text;
  v_signer_was_sent boolean;
  v_signer_was_viewed boolean;
  v_signer_was_signed boolean;
  v_title_label text;
begin
  select lower(coalesce(nullif(trim(packet_type), ''), 'document'))
    into v_packet_type
  from public.document_packets
  where id = new.packet_id;

  v_document_label := public.bridge_legal_document_notification_label_phase1(v_packet_type);
  v_title_label := case when v_document_label = 'OTP' then 'OTP' else initcap(v_document_label) end;
  v_signer_role := lower(coalesce(nullif(trim(new.signer_role), ''), 'signer'));
  v_signer_label := coalesce(nullif(trim(new.signer_name), ''), initcap(replace(v_signer_role, '_', ' ')), 'Signer');

  if tg_op = 'INSERT' then
    v_signer_was_sent := lower(coalesce(new.status, '')) = 'sent';
    v_signer_was_viewed := lower(coalesce(new.status, '')) = 'viewed' or new.viewed_at is not null;
    v_signer_was_signed := lower(coalesce(new.status, '')) = 'signed' or new.signed_at is not null;
  else
    v_signer_was_sent :=
      lower(coalesce(new.status, '')) = 'sent'
      and lower(coalesce(old.status, '')) is distinct from 'sent';

    v_signer_was_viewed :=
      (
        lower(coalesce(new.status, '')) = 'viewed'
        and lower(coalesce(old.status, '')) is distinct from 'viewed'
      )
      or (new.viewed_at is not null and old.viewed_at is null);

    v_signer_was_signed :=
      (
        lower(coalesce(new.status, '')) = 'signed'
        and lower(coalesce(old.status, '')) is distinct from 'signed'
      )
      or (new.signed_at is not null and old.signed_at is null);
  end if;

  if v_signer_was_sent then
    perform public.bridge_emit_legal_document_agent_notification_phase1(
      'legal_document_signing_sent',
      new.packet_id,
      new.packet_version_id,
      new.id,
      v_title_label || ' sent for signature',
      v_signer_label || ' has been sent the ' || v_document_label || ' signing link.',
      'legal-document-signing-sent:' || new.packet_id::text || ':' || coalesce(new.packet_version_id::text, '') || ':' || new.id::text,
      jsonb_build_object(
        'signerRole', new.signer_role,
        'signerName', new.signer_name,
        'signerEmailPresent', nullif(trim(coalesce(new.signer_email, '')), '') is not null,
        'signingStatus', new.status
      )
    );
  end if;

  if v_signer_was_viewed then
    perform public.bridge_emit_legal_document_agent_notification_phase1(
      'legal_document_signer_viewed',
      new.packet_id,
      new.packet_version_id,
      new.id,
      v_title_label || ' viewed by ' || v_signer_label,
      v_signer_label || ' opened the ' || v_document_label || ' signing link.',
      'legal-document-signer-viewed:' || new.packet_id::text || ':' || coalesce(new.packet_version_id::text, '') || ':' || new.id::text,
      jsonb_build_object(
        'signerRole', new.signer_role,
        'signerName', new.signer_name,
        'signerEmailPresent', nullif(trim(coalesce(new.signer_email, '')), '') is not null,
        'viewedAt', new.viewed_at,
        'signingStatus', new.status
      )
    );
  end if;

  if v_signer_was_signed then
    perform public.bridge_emit_legal_document_agent_notification_phase1(
      'legal_document_signer_signed',
      new.packet_id,
      new.packet_version_id,
      new.id,
      v_title_label || ' signed by ' || v_signer_label,
      v_signer_label || ' signed the ' || v_document_label || '. The final signed copy will be available in the document workspace after finalisation.',
      'legal-document-signer-signed:' || new.packet_id::text || ':' || coalesce(new.packet_version_id::text, '') || ':' || new.id::text,
      jsonb_build_object(
        'signerRole', new.signer_role,
        'signerName', new.signer_name,
        'signerEmailPresent', nullif(trim(coalesce(new.signer_email, '')), '') is not null,
        'signedAt', new.signed_at,
        'signingStatus', new.status
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_legal_document_signer_agent_notification_phase1
  on public.document_packet_signers;
create trigger trg_legal_document_signer_agent_notification_phase1
after insert or update of status, viewed_at, signed_at
on public.document_packet_signers
for each row
execute function public.bridge_legal_document_signer_agent_notification_phase1();

create or replace function public.bridge_legal_document_final_ready_agent_notification_phase1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_document_label text;
  v_title_label text;
  v_became_ready boolean;
  v_new_ready boolean;
  v_old_ready boolean := false;
begin
  v_new_ready :=
    nullif(trim(coalesce(new.final_signed_document_id::text, '')), '') is not null
    or nullif(trim(coalesce(new.final_signed_file_path, '')), '') is not null
    or nullif(trim(coalesce(new.final_signed_file_url, '')), '') is not null;

  if tg_op = 'UPDATE' then
    v_old_ready :=
      nullif(trim(coalesce(old.final_signed_document_id::text, '')), '') is not null
      or nullif(trim(coalesce(old.final_signed_file_path, '')), '') is not null
      or nullif(trim(coalesce(old.final_signed_file_url, '')), '') is not null;
  end if;

  v_became_ready := v_new_ready and not v_old_ready;

  if not v_became_ready then
    return new;
  end if;

  select *
    into v_packet
  from public.document_packets
  where id = new.packet_id;

  v_document_label := public.bridge_legal_document_notification_label_phase1(v_packet.packet_type);
  v_title_label := case when v_document_label = 'OTP' then 'OTP' else v_document_label end;

  perform public.bridge_emit_legal_document_agent_notification_phase1(
    'legal_document_signed_ready',
    new.packet_id,
    new.id,
    null,
    'Signed ' || v_title_label || ' ready to view',
    'The final signed ' || v_document_label || ' is ready to view and download.',
    'legal-document-signed-ready:' || new.packet_id::text || ':' || new.id::text,
    jsonb_build_object(
      'packetStatus', v_packet.status,
      'finalSignedDocumentId', new.final_signed_document_id,
      'finalSignedFilePathPresent', nullif(trim(coalesce(new.final_signed_file_path, '')), '') is not null,
      'finalisedAt', new.finalised_at
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_legal_document_final_ready_agent_notification_phase1
  on public.document_packet_versions;
create trigger trg_legal_document_final_ready_agent_notification_phase1
after insert or update of final_signed_document_id, final_signed_file_path, final_signed_file_url
on public.document_packet_versions
for each row
execute function public.bridge_legal_document_final_ready_agent_notification_phase1();

create or replace function public.bridge_queue_legal_document_signing_reminders_phase1(
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
  v_now timestamptz := coalesce(p_now, now());
  v_limit integer := greatest(0, least(coalesce(p_limit, 100), 500));
  v_candidate record;
  v_candidate_count integer := 0;
  v_emitted_count integer := 0;
  v_result jsonb;
  v_document_label text;
  v_title_label text;
  v_signer_label text;
begin
  for v_candidate in
    select *
    from (
      select
        signer.id as signer_id,
        signer.packet_id,
        signer.packet_version_id,
        signer.signer_role,
        signer.signer_name,
        signer.signer_email,
        signer.status,
        signer.signed_at,
        signer.viewed_at,
        packet.packet_type,
        cadence.reminder_day,
        coalesce(signer.viewed_at, signer.token_used_at, signer.created_at) as anchor_at,
        'legal-document-signing-reminder:' || signer.packet_id::text || ':' ||
          coalesce(signer.packet_version_id::text, '') || ':' || signer.id::text ||
          ':day-' || cadence.reminder_day::text as dedupe_key
      from public.document_packet_signers signer
      join public.document_packets packet on packet.id = signer.packet_id
      cross join lateral (values (1), (2)) cadence(reminder_day)
      where lower(coalesce(signer.status, '')) in ('sent', 'viewed')
        and signer.signed_at is null
        and coalesce(signer.token_expires_at, v_now + interval '1 day') > v_now
        and coalesce(signer.viewed_at, signer.token_used_at, signer.created_at) <= v_now - (cadence.reminder_day::text || ' days')::interval
        and not exists (
          select 1
          from public.notification_events existing
          where existing.dedupe_key = 'legal-document-signing-reminder:' || signer.packet_id::text || ':' ||
            coalesce(signer.packet_version_id::text, '') || ':' || signer.id::text ||
            ':day-' || cadence.reminder_day::text
        )
      order by coalesce(signer.viewed_at, signer.token_used_at, signer.created_at), cadence.reminder_day
      limit v_limit
    ) candidates
  loop
    v_candidate_count := v_candidate_count + 1;

    if coalesce(p_dry_run, false) then
      continue;
    end if;

    v_document_label := public.bridge_legal_document_notification_label_phase1(v_candidate.packet_type);
    v_title_label := case when v_document_label = 'OTP' then 'OTP' else initcap(v_document_label) end;
    v_signer_label := coalesce(
      nullif(trim(v_candidate.signer_name), ''),
      initcap(replace(coalesce(nullif(trim(v_candidate.signer_role), ''), 'signer'), '_', ' '))
    );

    v_result := public.bridge_emit_legal_document_agent_notification_phase1(
      'legal_document_signing_reminder',
      v_candidate.packet_id,
      v_candidate.packet_version_id,
      v_candidate.signer_id,
      v_title_label || ' signature still outstanding',
      v_signer_label || ' has not signed the ' || v_document_label || ' after ' ||
        v_candidate.reminder_day::text || case when v_candidate.reminder_day = 1 then ' day.' else ' days.' end,
      v_candidate.dedupe_key,
      jsonb_build_object(
        'signerRole', v_candidate.signer_role,
        'signerName', v_candidate.signer_name,
        'signerEmailPresent', nullif(trim(coalesce(v_candidate.signer_email, '')), '') is not null,
        'reminderDay', v_candidate.reminder_day,
        'anchorAt', v_candidate.anchor_at,
        'signingStatus', v_candidate.status
      )
    );

    if coalesce((v_result ->> 'emitted')::boolean, false) then
      v_emitted_count := v_emitted_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'phase', 'legal_document_agent_notification_sequence',
    'dryRun', coalesce(p_dry_run, false),
    'candidateCount', v_candidate_count,
    'emittedCount', v_emitted_count,
    'generatedAt', v_now
  );
end;
$$;

drop policy if exists legal_document_notifications_select_phase1
  on public.transaction_notifications;
create policy legal_document_notifications_select_phase1
on public.transaction_notifications
for select to authenticated
using (
  user_id = auth.uid()
  and event_data ->> 'notificationDomain' = 'legal_document'
);

drop policy if exists legal_document_notifications_update_phase1
  on public.transaction_notifications;
create policy legal_document_notifications_update_phase1
on public.transaction_notifications
for update to authenticated
using (
  user_id = auth.uid()
  and event_data ->> 'notificationDomain' = 'legal_document'
)
with check (
  user_id = auth.uid()
  and event_data ->> 'notificationDomain' = 'legal_document'
);

revoke all on function public.bridge_legal_document_notification_uuid_phase1(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_legal_document_notification_label_phase1(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_legal_document_agent_context_phase1(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bridge_emit_legal_document_agent_notification_phase1(text, uuid, uuid, uuid, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bridge_legal_document_signer_agent_notification_phase1() from public, anon, authenticated, service_role;
revoke all on function public.bridge_legal_document_final_ready_agent_notification_phase1() from public, anon, authenticated, service_role;
revoke all on function public.bridge_queue_legal_document_signing_reminders_phase1(integer, timestamptz, boolean) from public, anon, authenticated, service_role;
grant execute on function public.bridge_queue_legal_document_signing_reminders_phase1(integer, timestamptz, boolean) to service_role;

comment on function public.bridge_queue_legal_document_signing_reminders_phase1(integer, timestamptz, boolean) is
  'Queues agent in-app reminders after day 1 and day 2 when a mandate or OTP signer has not completed.';

do $block$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
      from cron.job
     where jobname = 'arch9-legal-document-signing-reminders-hourly'
        or command ilike '%bridge_queue_legal_document_signing_reminders_phase1%'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end;
$block$;

select cron.schedule(
  'arch9-legal-document-signing-reminders-hourly',
  '17 * * * *',
  $schedule$select public.bridge_queue_legal_document_signing_reminders_phase1(100, now(), false);$schedule$
);

notify pgrst, 'reload schema';
commit;
