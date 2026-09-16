-- Emergency production data patch: Produktive transaction partner directory.
-- Scope: three confirmed attorney firms and one confirmed bond originator only.
begin;

update public.organisations
set
  name = 'BetterBond',
  display_name = 'BetterBond',
  updated_at = now()
where id = '72128292-9038-4d1b-8a56-05c464960880';

with target_partners (partner_type, partner_organisation_id, company_name, email_address) as (
  values
    ('transfer_attorney', '14d34a48-f9fa-4ab0-9589-ebbc446bdaa7'::uuid, 'PPM Attorneys', 'admin@ppm-attorneys.test'),
    ('transfer_attorney', 'c77be0f8-c6db-45af-8daa-ca6645e4ec2b'::uuid, 'Jan L. Jordaan Inc. Attorneys', 'janljordaan.demo@arch9-demo.test'),
    ('transfer_attorney', '37f3adfa-5f63-45af-95cf-9acb5037b38e'::uuid, 'Tuckers Attorneys', 'admin@tuckers-attorneys.test'),
    ('bond_originator', '72128292-9038-4d1b-8a56-05c464960880'::uuid, 'BetterBond', 'bond.demo@bridgenine.co.za')
), produktive as (
  select id
  from public.organisations
  where id = 'efa6c6ff-6941-4b59-8bcb-e4d9ba9e585a'::uuid
)
update public.organisation_preferred_partners as partner
set
  is_active = false,
  is_preferred_default = false,
  updated_at = now()
where partner.organisation_id = (select id from produktive)
  and partner.partner_type in ('transfer_attorney', 'bond_originator')
  and not exists (
    select 1
    from target_partners target
    where target.partner_type = partner.partner_type
      and target.partner_organisation_id = partner.partner_organisation_id
  );

with target_partners (partner_type, partner_organisation_id, company_name, email_address) as (
  values
    ('transfer_attorney', '14d34a48-f9fa-4ab0-9589-ebbc446bdaa7'::uuid, 'PPM Attorneys', 'admin@ppm-attorneys.test'),
    ('transfer_attorney', 'c77be0f8-c6db-45af-8daa-ca6645e4ec2b'::uuid, 'Jan L. Jordaan Inc. Attorneys', 'janljordaan.demo@arch9-demo.test'),
    ('transfer_attorney', '37f3adfa-5f63-45af-95cf-9acb5037b38e'::uuid, 'Tuckers Attorneys', 'admin@tuckers-attorneys.test'),
    ('bond_originator', '72128292-9038-4d1b-8a56-05c464960880'::uuid, 'BetterBond', 'bond.demo@bridgenine.co.za')
), produktive as (
  select id
  from public.organisations
  where id = 'efa6c6ff-6941-4b59-8bcb-e4d9ba9e585a'::uuid
)
update public.organisation_preferred_partners as partner
set
  company_name = target.company_name,
  email_address = target.email_address,
  is_active = true,
  updated_at = now()
from target_partners target
where partner.organisation_id = (select id from produktive)
  and partner.partner_type = target.partner_type
  and partner.partner_organisation_id = target.partner_organisation_id;

with target_partners (partner_type, partner_organisation_id, company_name, email_address) as (
  values
    ('transfer_attorney', '14d34a48-f9fa-4ab0-9589-ebbc446bdaa7'::uuid, 'PPM Attorneys', 'admin@ppm-attorneys.test'),
    ('transfer_attorney', 'c77be0f8-c6db-45af-8daa-ca6645e4ec2b'::uuid, 'Jan L. Jordaan Inc. Attorneys', 'janljordaan.demo@arch9-demo.test'),
    ('transfer_attorney', '37f3adfa-5f63-45af-95cf-9acb5037b38e'::uuid, 'Tuckers Attorneys', 'admin@tuckers-attorneys.test'),
    ('bond_originator', '72128292-9038-4d1b-8a56-05c464960880'::uuid, 'BetterBond', 'bond.demo@bridgenine.co.za')
), produktive as (
  select id
  from public.organisations
  where id = 'efa6c6ff-6941-4b59-8bcb-e4d9ba9e585a'::uuid
)
insert into public.organisation_preferred_partners (
  organisation_id,
  partner_type,
  partner_organisation_id,
  company_name,
  email_address,
  is_active,
  is_preferred_default,
  source,
  scope_type,
  scope_json
)
select
  produktive.id,
  target.partner_type,
  target.partner_organisation_id,
  target.company_name,
  target.email_address,
  true,
  false,
  'manual',
  'all_developments',
  '{}'::jsonb
from target_partners target
cross join produktive
where not exists (
  select 1
  from public.organisation_preferred_partners partner
  where partner.organisation_id = produktive.id
    and partner.partner_type = target.partner_type
    and partner.partner_organisation_id = target.partner_organisation_id
);

commit;
