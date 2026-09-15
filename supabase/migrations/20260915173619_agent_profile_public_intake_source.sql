-- Preserve the digital agent-profile surface as a first-class lead source.
-- This migration is intentionally additive and is not applied by local builds.

alter table if exists public.leads
  drop constraint if exists leads_source_channel_check;

alter table if exists public.leads
  add constraint leads_source_channel_check
  check (
    source_channel is null
    or source_channel in (
      'instagram', 'facebook', 'linkedin', 'website', 'whatsapp', 'email',
      'qr', 'referral', 'manual', 'agent_profile', 'other'
    )
  );

alter table if exists public.agency_public_intake_submissions
  drop constraint if exists agency_public_intake_submissions_source_channel_check;

alter table if exists public.agency_public_intake_submissions
  add constraint agency_public_intake_submissions_source_channel_check
  check (
    source_channel in (
      'instagram', 'facebook', 'linkedin', 'website', 'whatsapp', 'email',
      'qr', 'referral', 'manual', 'agent_profile', 'other'
    )
  );
