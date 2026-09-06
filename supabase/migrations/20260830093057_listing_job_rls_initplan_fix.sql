begin;

drop policy if exists listing_background_jobs_insert_visible_listing
  on public.listing_background_jobs;

create policy listing_background_jobs_insert_visible_listing
  on public.listing_background_jobs for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and exists (
      select 1
      from public.private_listings listing
      where listing.id = listing_background_jobs.listing_id
        and listing.organisation_id = listing_background_jobs.organisation_id
    )
  );

commit;
