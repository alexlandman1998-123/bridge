begin;

-- A website enquiry is an organisation-level CRM event.  Keep the existing
-- atomic website-to-CRM command, but route its immediate email to the
-- principal (falling back to the highest available manager) for every form.
-- This includes property, valuation, campaign and general-contact enquiries.
do $principal_website_enquiries$
declare
  v_definition text;
  v_recipient_block text := E'  if v_assignee_id is not null then\n    v_recipient_id := v_assignee_id;\n    v_recipient_email := v_assignee_email;\n    v_recipient_name := v_assignee_name;\n    v_recipient_role := ''agent'';\n    v_event_kind := ''new_enquiry_assigned_agent'';\n  else\n    v_recipient_id := v_manager_id;\n    v_recipient_email := v_manager_email;\n    v_recipient_name := v_manager_name;\n    v_recipient_role := ''manager'';\n    v_event_kind := ''new_enquiry_unassigned_manager'';\n  end if;';
  v_principal_block text := E'  v_recipient_id := v_manager_id;\n  v_recipient_email := v_manager_email;\n  v_recipient_name := v_manager_name;\n  v_recipient_role := ''principal'';\n  v_event_kind := ''new_website_enquiry_principal'';';
  v_payload_old text := E'''pageId'', p_page_id, ''listingId'', p_listing_id, ''leadIntent'', v_lead_intent, ''leadCategory'', v_lead_category';
  v_payload_new text := E'''pageId'', p_page_id, ''listingId'', p_listing_id, ''leadIntent'', v_lead_intent, ''leadCategory'', v_lead_category,\n      ''enquiryType'', pg_catalog.replace(v_type, ''_'', '' ''),\n      ''propertyLabel'', v_property_label,\n      ''propertyAddress'', v_publication.address,\n      ''propertyPrice'', case when v_publication.asking_price is null then null else ''R '' || pg_catalog.to_char(v_publication.asking_price, ''FM999G999G999G990D00'') end';
  v_notification_payload_old text := E'''leadStatus'', ''New Lead'', ''propertyLabel'', v_property_label)';
  v_notification_payload_new text := E'''leadStatus'', ''New Lead'', ''propertyLabel'', v_property_label,\n        ''propertyAddress'', v_publication.address,\n        ''propertyPrice'', case when v_publication.asking_price is null then null else ''R '' || pg_catalog.to_char(v_publication.asking_price, ''FM999G999G999G990D00'') end,\n        ''enquiryType'', pg_catalog.replace(v_type, ''_'', '' ''),\n        ''enquiryIntent'', v_lead_intent,\n        ''enquiryMessage'', v_message)';
begin
  select pg_get_functiondef(
    'public.website_capture_lead_submission(text,text,uuid,uuid,text,text,text,text,boolean,boolean,text,text,jsonb)'::regprocedure
  ) into v_definition;

  if position(v_recipient_block in v_definition) = 0
     or position(v_payload_old in v_definition) = 0
     or position(v_notification_payload_old in v_definition) = 0 then
    raise exception 'Could not locate the expected website lead notification contract for principal routing';
  end if;

  v_definition := replace(v_definition, v_recipient_block, v_principal_block);
  v_definition := replace(v_definition, v_payload_old, v_payload_new);
  v_definition := replace(v_definition, v_notification_payload_old, v_notification_payload_new);
  v_definition := replace(
    v_definition,
    E'case when v_event_kind = ''new_enquiry_assigned_agent'' then ''New enquiry assigned to you'' else ''New enquiry needs assignment'' end,',
    E'''New website enquiry received'',');

  execute v_definition;
end;
$principal_website_enquiries$;

commit;
