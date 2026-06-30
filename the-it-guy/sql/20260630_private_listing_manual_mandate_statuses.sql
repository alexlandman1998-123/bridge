begin;

alter table if exists public.private_listings
  drop constraint if exists private_listings_mandate_status_check;

alter table if exists public.private_listings
  add constraint private_listings_mandate_status_check
  check (
    mandate_status in (
      'not_started',
      'in_progress',
      'ready',
      'generated',
      'sent',
      'viewed',
      'signed',
      'signed_uploaded',
      'signed_external_pending_upload',
      'rejected',
      'expired'
    )
  );

commit;
