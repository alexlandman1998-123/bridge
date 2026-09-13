begin;

-- Deliberately non-provider records for exercising the Revo inbox UI before
-- real Email and WhatsApp connections are enabled. Every row is labelled in
-- metadata and can be removed by provider_key = 'revo_demo_seed'.
do $$
declare
  v_organisation_id constant uuid := '322c3853-2d82-4413-97e6-b4cd8bc32a7c';
  v_whatsapp_channel_id uuid;
  v_email_channel_id uuid;
  v_sarah uuid;
  v_mark uuid;
  v_nomvula uuid;
  v_jason uuid;
begin
  insert into public.revo_inbox_channels (
    organisation_id, channel, provider_key, address, display_name, connection_status, metadata_json
  ) values
    (v_organisation_id, 'whatsapp', 'revo_demo_seed', '+27000000001', 'Demo WhatsApp', 'connected', '{"demo":true}'::jsonb),
    (v_organisation_id, 'email', 'revo_demo_seed', 'demo-inbox@revo.local', 'Demo Inbox', 'connected', '{"demo":true}'::jsonb)
  on conflict (organisation_id, channel, lower(address)) do update
    set display_name = excluded.display_name,
        connection_status = excluded.connection_status,
        metadata_json = excluded.metadata_json;

  select id into v_whatsapp_channel_id from public.revo_inbox_channels
  where organisation_id = v_organisation_id and provider_key = 'revo_demo_seed' and channel = 'whatsapp';
  select id into v_email_channel_id from public.revo_inbox_channels
  where organisation_id = v_organisation_id and provider_key = 'revo_demo_seed' and channel = 'email';

  insert into public.revo_inbox_conversations (
    organisation_id, channel_id, provider_key, provider_thread_id, contact_name, contact_address,
    subject, status, last_message_at, last_inbound_at, last_message_preview, metadata_json
  ) values
    (v_organisation_id, v_whatsapp_channel_id, 'revo_demo_seed', 'demo-sarah-williams', 'Sarah Williams', '+27 82 555 0198', '18 Oak Avenue, Waterkloof', 'waiting_on_us', now() - interval '4 minutes', now() - interval '4 minutes', 'Yes, 10:00 works well. Looking forward to it.', '{"demo":true,"scenario":"buyer-viewing"}'::jsonb),
    (v_organisation_id, v_email_channel_id, 'revo_demo_seed', 'demo-mark-pretorius', 'Mark Pretorius', 'mark.pretorius@example.test', 'Similar properties in Bryanston', 'waiting_on_us', now() - interval '32 minutes', now() - interval '32 minutes', 'Do you have any similar properties available?', '{"demo":true,"scenario":"email-enquiry"}'::jsonb),
    (v_organisation_id, v_whatsapp_channel_id, 'revo_demo_seed', 'demo-nomvula-dlamini', 'Nomvula Dlamini', '+27 83 620 8871', '5 Laurel Close, Sandton', 'waiting_on_client', now() - interval '1 hour', now() - interval '70 minutes', 'Would Saturday morning work for you?', '{"demo":true,"scenario":"awaiting-client"}'::jsonb),
    (v_organisation_id, v_email_channel_id, 'revo_demo_seed', 'demo-jason-smith', 'Jason Smith', 'jason.smith@example.test', 'New website enquiry', 'open', now() - interval '1 day', now() - interval '1 day', 'I would like more information about this property.', '{"demo":true,"scenario":"new-lead"}'::jsonb)
  on conflict (organisation_id, channel_id, provider_key, provider_thread_id) where provider_key is not null and provider_thread_id is not null do update
    set contact_name = excluded.contact_name,
        contact_address = excluded.contact_address,
        subject = excluded.subject,
        status = excluded.status,
        last_message_at = excluded.last_message_at,
        last_inbound_at = excluded.last_inbound_at,
        last_message_preview = excluded.last_message_preview,
        metadata_json = excluded.metadata_json;

  select id into v_sarah from public.revo_inbox_conversations where organisation_id = v_organisation_id and provider_key = 'revo_demo_seed' and provider_thread_id = 'demo-sarah-williams';
  select id into v_mark from public.revo_inbox_conversations where organisation_id = v_organisation_id and provider_key = 'revo_demo_seed' and provider_thread_id = 'demo-mark-pretorius';
  select id into v_nomvula from public.revo_inbox_conversations where organisation_id = v_organisation_id and provider_key = 'revo_demo_seed' and provider_thread_id = 'demo-nomvula-dlamini';
  select id into v_jason from public.revo_inbox_conversations where organisation_id = v_organisation_id and provider_key = 'revo_demo_seed' and provider_thread_id = 'demo-jason-smith';

  insert into public.revo_inbox_messages (
    organisation_id, conversation_id, channel, direction, message_type, provider_key, provider_message_id,
    provider_thread_id, sender_address, recipient_addresses, subject, body_text, delivery_status, occurred_at, metadata_json
  ) values
    (v_organisation_id, v_sarah, 'whatsapp', 'inbound', 'message', 'revo_demo_seed', 'demo-sarah-1', 'demo-sarah-williams', '+27825550198', array['+27000000001'], '18 Oak Avenue, Waterkloof', 'Hi there! I am interested in 18 Oak Avenue. Is it still available?', 'received', now() - interval '18 minutes', '{"demo":true}'::jsonb),
    (v_organisation_id, v_sarah, 'whatsapp', 'outbound', 'message', 'revo_demo_seed', 'demo-sarah-2', 'demo-sarah-williams', '+27000000001', array['+27825550198'], '18 Oak Avenue, Waterkloof', 'Hi Sarah! Yes, 18 Oak Avenue is still available. Would you like to arrange a viewing?', 'delivered', now() - interval '13 minutes', '{"demo":true}'::jsonb),
    (v_organisation_id, v_sarah, 'whatsapp', 'inbound', 'message', 'revo_demo_seed', 'demo-sarah-3', 'demo-sarah-williams', '+27825550198', array['+27000000001'], '18 Oak Avenue, Waterkloof', 'Yes, 10:00 works well. Looking forward to it.', 'received', now() - interval '4 minutes', '{"demo":true}'::jsonb),
    (v_organisation_id, v_sarah, 'whatsapp', 'internal', 'note', 'revo_demo_seed', 'demo-sarah-note', 'demo-sarah-williams', 'revo-demo@local', array['+27000000001'], '18 Oak Avenue, Waterkloof', 'Demo note: buyer appears qualified. Use Create viewing to test the workflow handoff.', 'queued', now() - interval '2 minutes', '{"demo":true}'::jsonb),
    (v_organisation_id, v_mark, 'email', 'inbound', 'message', 'revo_demo_seed', 'demo-mark-1', 'demo-mark-pretorius', 'mark.pretorius@example.test', array['demo-inbox@revo.local'], 'Similar properties in Bryanston', 'Do you have any similar properties available in Bryanston?', 'received', now() - interval '32 minutes', '{"demo":true}'::jsonb),
    (v_organisation_id, v_nomvula, 'whatsapp', 'inbound', 'message', 'revo_demo_seed', 'demo-nomvula-1', 'demo-nomvula-dlamini', '+27836208871', array['+27000000001'], '5 Laurel Close, Sandton', 'When can we view the property?', 'received', now() - interval '70 minutes', '{"demo":true}'::jsonb),
    (v_organisation_id, v_nomvula, 'whatsapp', 'outbound', 'message', 'revo_demo_seed', 'demo-nomvula-2', 'demo-nomvula-dlamini', '+27000000001', array['+27836208871'], '5 Laurel Close, Sandton', 'Would Saturday morning work for you?', 'delivered', now() - interval '1 hour', '{"demo":true}'::jsonb),
    (v_organisation_id, v_jason, 'email', 'inbound', 'message', 'revo_demo_seed', 'demo-jason-1', 'demo-jason-smith', 'jason.smith@example.test', array['demo-inbox@revo.local'], 'New website enquiry', 'I would like more information about this property.', 'received', now() - interval '1 day', '{"demo":true}'::jsonb)
  on conflict (organisation_id, provider_key, provider_message_id) where provider_message_id is not null do nothing;
end;
$$;

commit;
