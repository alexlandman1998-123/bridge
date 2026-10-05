-- Only after reverting the dependent application deployment; requires a separate reviewed decision.
-- Pre-change catalog confirmed these three RPCs were absent. No customer data is deleted.
begin;
drop function if exists public.save_rental_listing_media_snapshot(uuid,timestamptz,jsonb,jsonb,jsonb,integer,jsonb);
drop function if exists public.save_rental_listing_gallery(uuid,timestamptz,jsonb,integer);
drop function if exists public.save_rental_listing_snapshot(uuid,timestamptz,jsonb,jsonb,jsonb,integer);
commit;
