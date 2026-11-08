-- Read-only card enrichment. Keep the existing per-listing authorization and
-- readiness functions authoritative; publishing actions still read them afresh.
create or replace function public.website_get_listing_publication_statuses(
  p_listing_ids uuid[],
  p_include_partner boolean default true
)
returns table (listing_id uuid, publication jsonb, partner boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_listing_id uuid;
  v_publication jsonb;
  v_partner jsonb;
  v_is_partner boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_listing_ids), 0) > 100 then
    raise exception 'Request at most 100 listing statuses at a time.' using errcode = '22023';
  end if;
  for v_listing_id in
    select distinct requested.id
    from unnest(p_listing_ids) as requested(id)
    where requested.id is not null
    order by requested.id
  loop
    v_publication := null;
    v_is_partner := false;
    begin
      v_publication := public.website_get_listing_publication_status(v_listing_id);
      if p_include_partner and nullif(v_publication->>'websiteSiteId', '') is null then
        v_partner := public.website_get_partner_listing_status(v_listing_id);
        if v_partner->>'available' = 'true' and nullif(v_partner->>'websiteSiteId', '') is not null then
          v_publication := v_partner;
          v_is_partner := true;
        end if;
      end if;
    exception when others then
      -- Match the cards' existing per-row failure behavior. Never try a partner
      -- destination after the owned-listing read denies access; disclose no error.
      v_publication := null;
      v_is_partner := false;
    end;
    listing_id := v_listing_id;
    publication := v_publication;
    partner := v_is_partner;
    return next;
  end loop;
end;
$$;
revoke all on function public.website_get_listing_publication_statuses(uuid[], boolean) from public, anon;
grant execute on function public.website_get_listing_publication_statuses(uuid[], boolean) to authenticated;
