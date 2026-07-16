begin;

alter table public.attorney_client_financial_document_publication_events
  add column if not exists client_notification_id uuid references public.client_portal_notifications(id) on delete set null,
  add column if not exists notification_event_id uuid references public.notification_events(id) on delete set null,
  add column if not exists delivery_status text not null default 'pending';

alter table public.attorney_client_financial_document_publication_events
  drop constraint if exists attorney_client_financial_publication_delivery_status_check;
alter table public.attorney_client_financial_document_publication_events
  add constraint attorney_client_financial_publication_delivery_status_check
  check (delivery_status in ('pending', 'delivered', 'withdrawn', 'failed'));

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
  metadata_json
) values (
  'attorney_client_financial_document_publication',
  'Attorney client financial document publication',
  'notification',
  'system_event',
  null,
  array['in_app']::text[],
  'active',
  true,
  'document_recipient_publication',
  '{"module":"attorney_client_financial_documents","phase":4}'::jsonb
)
on conflict (automation_key) do update
set display_name = excluded.display_name,
    channels = excluded.channels,
    implementation_status = excluded.implementation_status,
    default_enabled = excluded.default_enabled,
    metadata_json = excluded.metadata_json,
    updated_at = now();

create or replace function public.bridge_deliver_attorney_client_financial_document_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_title text;
  v_description text;
  v_dedupe_key text;
  v_client_notification_id uuid;
  v_notification_event_id uuid;
begin
  v_label := case new.document_definition_key
    when 'buyer_transfer_cost_invoice' then 'Transfer Cost Invoice'
    when 'seller_attorney_invoice' then 'Attorney Invoice'
    when 'buyer_final_statement' then 'Final Statement'
    when 'seller_final_statement' then 'Final Statement'
    else 'Financial Document'
  end;
  v_dedupe_key := 'attorney_financial:' || new.transaction_id::text || ':' || new.document_definition_key || ':' || new.document_id::text;

  if new.action = 'published' then
    v_title := v_label || ' available';
    v_description := 'Your ' || lower(v_label) || ' is ready to view in Documents.';

    select notification.id into v_client_notification_id
    from public.client_portal_notifications notification
    where notification.transaction_id = new.transaction_id
      and notification.client_role = new.recipient_role
      and notification.dedupe_key = v_dedupe_key
    order by notification.created_at desc
    limit 1;

    if v_client_notification_id is null then
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
        new.transaction_id,
        new.recipient_role,
        'document_approved',
        v_title,
        v_description,
        'normal',
        'unread',
        'attorney_client_financial_document',
        new.document_id,
        'View document',
        'documents',
        'client_visible',
        jsonb_build_object(
          'documentDefinitionKey', new.document_definition_key,
          'documentId', new.document_id,
          'recipientRole', new.recipient_role,
          'source', 'attorney_client_financial_documents'
        ),
        v_dedupe_key
      ) returning id into v_client_notification_id;
    else
      update public.client_portal_notifications
      set title = v_title,
          description = v_description,
          status = 'unread',
          read_at = null,
          dismissed_at = null,
          updated_at = now()
      where id = v_client_notification_id;
    end if;
  else
    v_title := v_label || ' withdrawn';
    v_description := 'Portal access to this document was withdrawn by the attorney.';
    update public.client_portal_notifications
    set status = 'dismissed',
        dismissed_at = now(),
        updated_at = now()
    where transaction_id = new.transaction_id
      and client_role = new.recipient_role
      and dedupe_key = v_dedupe_key
    returning id into v_client_notification_id;
  end if;

  insert into public.notification_events (
    automation_key,
    organisation_id,
    transaction_id,
    transaction_notification_id,
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
    'attorney_client_financial_document_publication',
    new.organisation_id,
    new.transaction_id,
    null,
    'attorney_client_financial_document_' || new.action,
    'notification',
    'system_event',
    'in_app',
    'delivered',
    new.recipient_role,
    v_title,
    v_description,
    'attorney_client_financial_documents',
    v_dedupe_key || ':' || new.action || ':' || new.id::text,
    jsonb_build_object(
      'publicationEventId', new.id,
      'documentDefinitionKey', new.document_definition_key,
      'documentId', new.document_id,
      'action', new.action
    ),
    jsonb_build_object(
      'clientNotificationId', v_client_notification_id,
      'attorneyFirmId', new.attorney_firm_id
    ),
    now(),
    now(),
    now(),
    now()
  ) returning id into v_notification_event_id;

  update public.attorney_client_financial_document_publication_events
  set client_notification_id = v_client_notification_id,
      notification_event_id = v_notification_event_id,
      delivery_status = case when new.action = 'published' then 'delivered' else 'withdrawn' end
  where id = new.id;

  return new;
exception
  when others then
    update public.attorney_client_financial_document_publication_events
    set delivery_status = 'failed'
    where id = new.id;
    return new;
end;
$$;

drop trigger if exists attorney_client_financial_publication_delivery
  on public.attorney_client_financial_document_publication_events;
create trigger attorney_client_financial_publication_delivery
after insert on public.attorney_client_financial_document_publication_events
for each row execute function public.bridge_deliver_attorney_client_financial_document_publication();

revoke all on function public.bridge_deliver_attorney_client_financial_document_publication()
  from public, anon, authenticated;

comment on function public.bridge_deliver_attorney_client_financial_document_publication() is
  'Phase 4 in-app delivery adapter. Publication stays successful if notification delivery fails, while the event records failed delivery for operational follow-up.';

create or replace function public.bridge_attorney_client_financial_notifications_by_token(
  p_token text,
  p_recipient_role text,
  p_seller_access_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_recipient_role text := lower(trim(coalesce(p_recipient_role, '')));
  v_transaction_id uuid;
  v_seller_payload jsonb;
  v_listing_id uuid;
  v_result jsonb;
begin
  if v_token is null or v_recipient_role not in ('buyer', 'seller') then
    return '[]'::jsonb;
  end if;

  if v_recipient_role = 'buyer' then
    select link.transaction_id into v_transaction_id
    from public.client_portal_links link
    where link.token = v_token
      and coalesce(link.is_active, true) = true
    order by link.created_at desc
    limit 1;
  else
    v_seller_payload := public.bridge_private_listing_seller_portal_payload(v_token, p_seller_access_token, true);
    if v_seller_payload is null or coalesce((v_seller_payload ->> 'authRequired')::boolean, false) then
      return '[]'::jsonb;
    end if;
    v_listing_id := nullif(v_seller_payload #>> '{listing,id}', '')::uuid;
    v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
  end if;

  if v_transaction_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(to_jsonb(notification) order by notification.created_at desc), '[]'::jsonb)
  into v_result
  from public.client_portal_notifications notification
  where notification.transaction_id = v_transaction_id
    and notification.client_role = v_recipient_role
    and notification.visibility = 'client_visible'
    and notification.status <> 'dismissed'
    and notification.related_entity_type = 'attorney_client_financial_document';

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.bridge_attorney_client_financial_notifications_by_token(text, text, text)
  from public;
grant execute on function public.bridge_attorney_client_financial_notifications_by_token(text, text, text)
  to anon, authenticated;

comment on function public.bridge_attorney_client_financial_notifications_by_token(text, text, text) is
  'Returns recipient-scoped Phase 4 financial document notifications after validating the buyer or seller portal token.';

notify pgrst, 'reload schema';

commit;
