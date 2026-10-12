begin;

-- The browser matches this non-secret update ID to its saved request. Keep the
-- existing row-level agency checks and all worker claim fields restricted.
grant select (update_request_key) on public.listing_publication_jobs to authenticated;

commit;
