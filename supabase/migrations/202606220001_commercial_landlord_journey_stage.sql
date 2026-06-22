begin;

do $$
begin
  create type public.commercial_landlord_journey_stage as enum (
    'LEAD_CAPTURED',
    'CONTACTED',
    'ONBOARDING_SENT',
    'ONBOARDING_COMPLETE',
    'MANDATE_SENT',
    'MANDATE_COMPLETE',
    'LANDLORD_ONBOARDED'
  );
exception
  when duplicate_object then null;
end $$;

alter table if exists public.commercial_canvassing_prospects
  add column if not exists landlord_journey_stage public.commercial_landlord_journey_stage not null default 'LEAD_CAPTURED';

alter table if exists public.commercial_canvassing_prospects
  add column if not exists stage_completed_at jsonb not null default '{}'::jsonb;

alter table if exists public.commercial_canvassing_prospects
  add column if not exists stage_completed_by jsonb not null default '{}'::jsonb;

create index if not exists commercial_canvassing_prospects_landlord_journey_idx
  on public.commercial_canvassing_prospects (organisation_id, landlord_journey_stage, created_at desc)
  where prospect_role = 'landlord';

commit;
