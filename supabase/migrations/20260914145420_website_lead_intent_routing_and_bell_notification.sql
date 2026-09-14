begin;

-- Homepage enquiries have an explicit Buy/Sell/Rent/Other choice.  Keep the
-- classification at the privileged ingestion boundary so a client message
-- alone can never decide where a CRM lead lands.
do $intent_routing$
declare
  v_definition text;
  v_attribution_old text := '''userAgent'', nullif(pg_catalog.left(coalesce(p_attribution ->> ''userAgent'', ''''), 512), ''''), ''leadSource'', nullif(pg_catalog.left(coalesce(p_attribution ->> ''leadSource'', ''''), 80), '''')';
  v_attribution_new text := '''userAgent'', nullif(pg_catalog.left(coalesce(p_attribution ->> ''userAgent'', ''''), 512), ''''), ''leadSource'', nullif(pg_catalog.left(coalesce(p_attribution ->> ''leadSource'', ''''), 80), ''''), ''leadIntent'', nullif(pg_catalog.left(coalesce(p_attribution ->> ''leadIntent'', ''''), 16), '''')';
  v_declaration_old text := '  v_property_label text;';
  v_declaration_new text := E'  v_property_label text;\n  v_lead_category text;\n  v_lead_intent text;\n  v_in_app_notification_id uuid;';
  v_intent_marker text := E'  v_phone_digits := nullif(pg_catalog.regexp_replace(coalesce(v_phone, \'\'), \'[^0-9]+\', \'\', \'g\'), \'\');';
  v_intent_block text := E'  v_phone_digits := nullif(pg_catalog.regexp_replace(coalesce(v_phone, \'\'), \'[^0-9]+\', \'\', \'g\'), \'\');\n  v_lead_intent := pg_catalog.lower(trim(coalesce(p_attribution ->> \'leadIntent\', \'\')));\n  if v_lead_intent not in (\'buy\', \'sell\', \'rent\', \'other\') then\n    v_lead_intent := null;\n  end if;\n  v_lead_category := case\n    when v_type = \'valuation_request\' then \'seller\'\n    when v_type = \'general_enquiry\' and v_lead_intent = \'sell\' then \'seller\'\n    else \'buyer\'\n  end;';
  v_activity_marker text := E'  );\n\n  if v_recipient_email is not null then';
  v_activity_replacement text := E'  );\n\n  if v_recipient_id is not null then\n    v_in_app_notification_id := public.bridge_insert_invite_accepted_transaction_notification_phase2(\n      null, v_recipient_id, coalesce(v_recipient_role, \'agent\'),\n      case when v_lead_category = \'seller\' then \'New seller lead received\' else \'New buyer lead received\' end,\n      v_name || \' submitted a \' || v_lead_category || \' enquiry through the agency website.\',\n      \'website-lead-bell:\' || v_receipt_id::text || \':\' || v_recipient_id::text,\n      pg_catalog.jsonb_build_object(\n        \'leadId\', v_lead_id,\n        \'leadCategory\', v_lead_category,\n        \'leadIntent\', v_lead_intent,\n        \'leadSource\', \'Website\',\n        \'source\', \'agency_website\',\n        \'automationKey\', \'website_lead_received\',\n        \'actionRoute\', \'/pipeline\',\n        \'entityLabel\', \'Website lead\',\n        \'notificationDomain\', \'website_lead\'\n      )\n    );\n  end if;\n\n  if v_recipient_email is not null then';
begin
  select pg_get_functiondef(
    'public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb)'::regprocedure
  ) into v_definition;

  if position(v_attribution_old in v_definition) = 0
     or position(v_declaration_old in v_definition) = 0
     or position(v_intent_marker in v_definition) = 0
     or position(v_activity_marker in v_definition) = 0 then
    raise exception 'Could not locate the expected website lead capture contract for intent routing';
  end if;

  v_definition := replace(v_definition, v_attribution_old, v_attribution_new);
  v_definition := replace(v_definition, v_declaration_old, v_declaration_new);
  v_definition := replace(v_definition, v_intent_marker, v_intent_block);
  v_definition := replace(v_definition, 'case when v_type = ''valuation_request'' then ''seller'' else ''buyer'' end', 'v_lead_category');
  v_definition := replace(v_definition, '''pageId'', p_page_id, ''listingId'', p_listing_id', '''pageId'', p_page_id, ''listingId'', p_listing_id, ''leadIntent'', v_lead_intent, ''leadCategory'', v_lead_category');
  v_definition := replace(v_definition, v_activity_marker, v_activity_replacement);
  v_definition := replace(v_definition, '''notificationEventId'', v_event_id,', '''notificationEventId'', v_event_id, ''inAppNotificationId'', v_in_app_notification_id,');
  -- Bell routing is valid for an active workspace user even when an email
  -- address is unavailable; email remains conditional further below.
  v_definition := replace(v_definition, 'if v_assignee_id is not null and v_assignee_email is not null then', 'if v_assignee_id is not null then');
  v_definition := replace(v_definition, E'      and nullif(trim(member.email), \'\') is not null\n    and member.role', E'    and member.role');

  execute v_definition;
end;
$intent_routing$;

-- Website enquiries have no transaction yet.  The bell needs a narrow policy
-- that lets only the addressed agency user read and acknowledge the alert,
-- while retaining the normal agency lead visibility boundary.
drop policy if exists website_lead_notifications_select on public.transaction_notifications;
create policy website_lead_notifications_select
on public.transaction_notifications
for select to authenticated
using (
  transaction_id is null
  and user_id = auth.uid()
  and event_data ->> 'notificationDomain' = 'website_lead'
  and exists (
    select 1
    from public.leads lead
    where lead.lead_id::text = transaction_notifications.event_data ->> 'leadId'
      and lead.lead_domain = 'agency'
      and public.bridge_agency_lead_scope(lead.lead_id)
  )
);

drop policy if exists website_lead_notifications_update on public.transaction_notifications;
create policy website_lead_notifications_update
on public.transaction_notifications
for update to authenticated
using (
  transaction_id is null
  and user_id = auth.uid()
  and event_data ->> 'notificationDomain' = 'website_lead'
  and exists (
    select 1
    from public.leads lead
    where lead.lead_id::text = transaction_notifications.event_data ->> 'leadId'
      and lead.lead_domain = 'agency'
      and public.bridge_agency_lead_scope(lead.lead_id)
  )
)
with check (
  transaction_id is null
  and user_id = auth.uid()
  and event_data ->> 'notificationDomain' = 'website_lead'
  and exists (
    select 1
    from public.leads lead
    where lead.lead_id::text = transaction_notifications.event_data ->> 'leadId'
      and lead.lead_domain = 'agency'
      and public.bridge_agency_lead_scope(lead.lead_id)
  )
);

grant select, update on public.transaction_notifications to authenticated;

commit;
