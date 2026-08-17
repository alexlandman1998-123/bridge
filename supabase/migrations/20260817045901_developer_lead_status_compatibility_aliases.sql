alter table if exists public.developer_leads
  add column if not exists qualification_note text,
  add column if not exists next_action_note text;

alter table if exists public.developer_leads
  drop constraint if exists developer_leads_status_check;

alter table if exists public.developer_leads
  add constraint developer_leads_status_check
  check (
    lead_status in (
      'new',
      'captured',
      'lead_captured',
      'new_lead',
      'contacted',
      'qualified',
      'viewing',
      'reserved',
      'onboarding_sent',
      'buyer_onboarding_sent',
      'onboarding_submitted',
      'buyer_onboarding_submitted',
      'otp',
      'signed_otp',
      'signed_otp_uploaded',
      'otp_uploaded',
      'converted',
      'transaction_created',
      'lost'
    )
  );

update public.developer_leads
set lead_status = case lead_status
  when 'captured' then 'new'
  when 'lead_captured' then 'new'
  when 'new_lead' then 'new'
  when 'buyer_onboarding_sent' then 'onboarding_sent'
  when 'buyer_onboarding_submitted' then 'onboarding_submitted'
  when 'signed_otp' then 'otp'
  when 'signed_otp_uploaded' then 'otp'
  when 'otp_uploaded' then 'otp'
  when 'transaction_created' then 'converted'
  else lead_status
end
where lead_status in (
  'captured',
  'lead_captured',
  'new_lead',
  'buyer_onboarding_sent',
  'buyer_onboarding_submitted',
  'signed_otp',
  'signed_otp_uploaded',
  'otp_uploaded',
  'transaction_created'
);

notify pgrst, 'reload schema';
