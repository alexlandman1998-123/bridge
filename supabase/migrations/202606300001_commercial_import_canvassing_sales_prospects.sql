begin;

alter table public.commercial_import_batches
  drop constraint if exists commercial_import_batches_record_type_check;

alter table public.commercial_import_batches
  add constraint commercial_import_batches_record_type_check
    check (record_type in (
      'vacancies',
      'leads',
      'requirements',
      'canvassing_seller_prospects',
      'canvassing_buyer_prospects',
      'canvassing_landlord_prospects',
      'canvassing_tenant_prospects',
      'properties',
      'landlords',
      'companies',
      'contacts',
      'listings'
    ));

commit;
