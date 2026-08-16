begin;

alter table if exists public.developer_leads
  drop constraint if exists developer_leads_status_check;

alter table if exists public.developer_leads
  add constraint developer_leads_status_check
  check (
    lead_status in (
      'new',
      'contacted',
      'qualified',
      'viewing',
      'reserved',
      'onboarding_sent',
      'onboarding_submitted',
      'otp',
      'converted',
      'lost'
    )
  );

alter table if exists public.developer_lead_activity
  drop constraint if exists developer_lead_activity_type_check;

alter table if exists public.developer_lead_activity
  add constraint developer_lead_activity_type_check
  check (
    activity_type in (
      'created',
      'assigned',
      'status_changed',
      'reservation_changed',
      'handover_requested',
      'handover_completed',
      'buyer_onboarding_sent',
      'buyer_onboarding_submitted',
      'otp_uploaded',
      'converted_and_onboarding_sent',
      'converted',
      'note',
      'system'
    )
  );

comment on constraint developer_leads_status_check on public.developer_leads is
  'Developer buyer leads follow captured/contacted/qualified/viewing/onboarding sent/onboarding submitted/OTP before converted transaction workflow.';

notify pgrst, 'reload schema';

commit;
