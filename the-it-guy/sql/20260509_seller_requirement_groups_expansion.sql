begin;

alter table if exists public.private_listing_document_requirements
  add column if not exists applies_to text;

alter table if exists public.private_listing_document_requirements
  alter column applies_to set default 'seller';

update public.private_listing_document_requirements
set applies_to = 'seller'
where applies_to is null;

alter table if exists public.private_listing_document_requirements
  alter column applies_to set not null;

alter table if exists public.private_listing_document_requirements
  drop constraint if exists private_listing_document_requirements_group_check;

alter table if exists public.private_listing_document_requirements
  add constraint private_listing_document_requirements_group_check check (
    requirement_group in (
      'seller_identity',
      'fica',
      'marital',
      'company',
      'trust',
      'deceased_estate',
      'property',
      'financial',
      'mandate',
      'occupancy',
      'compliance',
      'marketing'
    )
  );

commit;
