alter table if exists public.leads
  add column if not exists listing_id text;

alter table if exists public.leads
  add column if not exists mandate_packet_id uuid references public.document_packets(id) on delete set null;

alter table if exists public.leads
  add column if not exists seller_onboarding_token text;

alter table if exists public.leads
  add column if not exists seller_onboarding_status text not null default 'not_started';

alter table if exists public.leads
  drop constraint if exists leads_seller_onboarding_status_check;

alter table if exists public.leads
  add constraint leads_seller_onboarding_status_check
  check (seller_onboarding_status in ('not_started', 'sent', 'in_progress', 'completed', 'rejected'));

create index if not exists leads_org_listing_idx
  on public.leads (organisation_id, listing_id);

create index if not exists leads_org_seller_onboarding_token_idx
  on public.leads (organisation_id, seller_onboarding_token);
