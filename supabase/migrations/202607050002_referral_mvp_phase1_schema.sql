begin;

alter table if exists public.lead_referrals
  add column if not exists referral_type text not null default 'client_referral',
  add column if not exists related_listing_id uuid references public.private_listings(id) on delete set null,
  add column if not exists source_branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists target_branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists protection_period_days integer not null default 30,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists accepted_by_email text,
  add column if not exists declined_at timestamptz,
  add column if not exists declined_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists declined_by_email text,
  add column if not exists decline_reason text,
  add column if not exists agreement_locked_at timestamptz;

alter table if exists public.lead_referrals
  drop constraint if exists lead_referrals_referral_type_check;
alter table if exists public.lead_referrals
  add constraint lead_referrals_referral_type_check
  check (referral_type in ('client_referral', 'buyer_introduction', 'listing_collaboration', 'external_referral'));

alter table if exists public.lead_referrals
  drop constraint if exists lead_referrals_status_check;
alter table if exists public.lead_referrals
  add constraint lead_referrals_status_check
  check (status in ('draft', 'sent', 'received', 'accepted', 'declined', 'needs_review', 'contacted', 'working', 'converted', 'lost', 'commission_due', 'paid', 'cancelled'));

alter table if exists public.lead_referrals
  drop constraint if exists lead_referrals_protection_period_days_check;
alter table if exists public.lead_referrals
  add constraint lead_referrals_protection_period_days_check
  check (protection_period_days between 1 and 3650);

alter table if exists public.referral_agreements
  add column if not exists protection_period_days integer not null default 30,
  add column if not exists accepted_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists declined_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists declined_by_email text,
  add column if not exists decline_reason text,
  add column if not exists locked_at timestamptz;

alter table if exists public.referral_agreements
  drop constraint if exists referral_agreements_protection_period_days_check;
alter table if exists public.referral_agreements
  add constraint referral_agreements_protection_period_days_check
  check (protection_period_days between 1 and 3650);

alter table if exists public.referral_invites
  add column if not exists declined_at timestamptz,
  add column if not exists declined_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists decline_reason text;

do $$
begin
  if to_regclass('public.lead_referrals') is not null then
    create index if not exists lead_referrals_type_status_idx
      on public.lead_referrals (source_organisation_id, referral_type, status, created_at desc);

    create index if not exists lead_referrals_related_listing_idx
      on public.lead_referrals (related_listing_id, status)
      where related_listing_id is not null;

    create index if not exists lead_referrals_branch_scope_idx
      on public.lead_referrals (source_branch_id, target_branch_id, status)
      where source_branch_id is not null or target_branch_id is not null;

    create index if not exists lead_referrals_acceptance_idx
      on public.lead_referrals (target_agent_id, status, accepted_at desc)
      where target_agent_id is not null;
  end if;
end $$;

commit;
