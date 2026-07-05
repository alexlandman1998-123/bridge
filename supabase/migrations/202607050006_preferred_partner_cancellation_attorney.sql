begin;

alter table if exists public.organisation_preferred_partners
  drop constraint if exists organisation_preferred_partners_partner_type_check;

alter table if exists public.organisation_preferred_partners
  add constraint organisation_preferred_partners_partner_type_check
  check (partner_type in ('agency', 'bond_originator', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney'));

commit;
