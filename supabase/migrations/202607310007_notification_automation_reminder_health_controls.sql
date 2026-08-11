begin;

-- Complete the definition-level controls required by the Phase 6 reminder-health
-- evaluator. These policies are metadata used by health/readiness and quiet-hour
-- aware dispatch; they do not enqueue or send any reminder by themselves.
update public.notification_automation_definitions
set reminder_policy = case automation_key
  when 'attorney_client_financial_document_reminder' then jsonb_build_object(
    'cadenceDays', jsonb_build_array(3, 7),
    'stopWhen', 'document_viewed',
    'quietHours', jsonb_build_object(
      'enabled', true,
      'timezone', 'Africa/Johannesburg',
      'startHour', 18,
      'endHour', 8
    ),
    'escalation', jsonb_build_object(
      'enabled', true,
      'afterDay', 10,
      'recipientRole', 'attorney',
      'label', 'Escalate an unviewed published financial document to the attorney.'
    ),
    'tone', 'premium_professional'
  )
  when 'attorney_lead_follow_up_due' then jsonb_build_object(
    'cadenceDays', jsonb_build_array(0),
    'stopWhen', 'follow_up_completed',
    'quietHours', jsonb_build_object(
      'enabled', true,
      'timezone', 'Africa/Johannesburg',
      'startHour', 18,
      'endHour', 8
    ),
    'escalation', jsonb_build_object(
      'enabled', true,
      'afterDay', 1,
      'recipientRole', 'assigned_user',
      'label', 'Escalate an overdue Attorney Lead follow-up to the assigned attorney.'
    ),
    'tone', 'premium_professional'
  )
  when 'attorney_lead_first_contact_overdue' then jsonb_build_object(
    'cadenceDays', jsonb_build_array(1),
    'stopWhen', 'first_contacted',
    'quietHours', jsonb_build_object(
      'enabled', true,
      'timezone', 'Africa/Johannesburg',
      'startHour', 18,
      'endHour', 8
    ),
    'escalation', jsonb_build_object(
      'enabled', true,
      'afterDay', 1,
      'recipientRole', 'assigned_user',
      'label', 'Escalate an Attorney Lead that remains without first contact.'
    ),
    'tone', 'premium_professional'
  )
  when 'attorney_lead_first_contact_escalated' then jsonb_build_object(
    'cadenceDays', jsonb_build_array(1),
    'stopWhen', 'first_contacted',
    'quietHours', jsonb_build_object(
      'enabled', true,
      'timezone', 'Africa/Johannesburg',
      'startHour', 18,
      'endHour', 8
    ),
    'escalation', jsonb_build_object(
      'enabled', true,
      'afterDay', 1,
      'recipientRole', 'admin',
      'label', 'Escalate an Attorney Lead still awaiting first contact to an administrator.'
    ),
    'tone', 'premium_professional'
  )
  when 'legal_document_signing_reminder' then jsonb_build_object(
    'cadenceDays', jsonb_build_array(1, 2),
    'stopWhen', 'signer_signed',
    'quietHours', jsonb_build_object(
      'enabled', true,
      'timezone', 'Africa/Johannesburg',
      'startHour', 18,
      'endHour', 8
    ),
    'escalation', jsonb_build_object(
      'enabled', true,
      'afterDay', 2,
      'recipientRole', 'assigned_agent',
      'label', 'Escalate an unsigned legal document after the final signing reminder.'
    ),
    'tone', 'premium_professional'
  )
  when 'legal_role_coordination_reminder' then jsonb_build_object(
    'cadenceDays', jsonb_build_array(0, 2, 5),
    'stopWhen', 'legal_role_state_changes',
    'quietHours', jsonb_build_object(
      'enabled', true,
      'timezone', 'Africa/Johannesburg',
      'startHour', 18,
      'endHour', 8
    ),
    'escalation', jsonb_build_object(
      'enabled', true,
      'afterDay', 5,
      'recipientRole', 'assigned_user',
      'label', 'Escalate an overdue bank-appointed legal role action to the transaction owner.'
    ),
    'tone', 'premium_professional'
  )
  else reminder_policy
end,
metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
  'phase', 'phase_7_reminder_health_controls',
  'premiumControls', jsonb_build_object(
    'dynamicCadence', true,
    'quietHoursAware', true,
    'escalationPolicy', true
  )
),
updated_at = now()
where automation_key in (
  'attorney_client_financial_document_reminder',
  'attorney_lead_follow_up_due',
  'attorney_lead_first_contact_overdue',
  'attorney_lead_first_contact_escalated',
  'legal_document_signing_reminder',
  'legal_role_coordination_reminder'
);

commit;
