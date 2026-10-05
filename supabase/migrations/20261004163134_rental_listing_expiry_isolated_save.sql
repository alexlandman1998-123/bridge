begin;
-- Date-only edits must not reconstruct legacy capture data or save editor drafts.
create or replace function public.save_rental_listing_expiry_v1(
 p_listing_id uuid, p_expected_updated_at timestamptz, p_expiry_date date
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
 v_listing public.private_listings%rowtype;
 v_before jsonb;
 v_facts jsonb;
 v_activity_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in before saving a rental listing.' using errcode='42501'; end if;
 select * into v_listing from public.private_listings where id=p_listing_id for update;
 if not found or not public.bridge_is_active_member(v_listing.organisation_id) then
  raise exception 'Rental listing is unavailable or outside your organisation.' using errcode='42501';
 end if;
 if v_listing.listing_category <> 'rental' or v_listing.listing_visibility='archived' or v_listing.listing_status='withdrawn' then
  raise exception 'Only an available rental listing can be saved.' using errcode='22023';
 end if;
 if p_expected_updated_at is null or v_listing.updated_at is distinct from p_expected_updated_at then
  raise exception 'This rental changed after it was opened. Reload before saving.' using errcode='40001';
 end if;
 if p_expiry_date is null or p_expiry_date <= (current_timestamp at time zone 'UTC')::date then
  raise exception 'Property24 expiry must be a future date.' using errcode='22023';
 end if;
 v_facts := coalesce(v_listing.seller_canonical_facts_json,'{}'::jsonb);
 if jsonb_typeof(v_facts) <> 'object' or (v_facts ? 'rentalInfo' and v_facts->'rentalInfo' <> 'null'::jsonb and jsonb_typeof(v_facts->'rentalInfo') <> 'object') then
  raise exception 'Rental facts need review before changing expiry.' using errcode='22023';
 end if;
 v_before := public.rental_listing_history_snapshot(p_listing_id);
 v_facts := jsonb_set(v_facts,'{rentalInfo}',coalesce(nullif(v_facts->'rentalInfo','null'::jsonb),'{}'::jsonb) || jsonb_build_object('property24ExpiryDate',p_expiry_date::text),true);
 update public.private_listings set seller_canonical_facts_json=v_facts,
  seller_canonical_facts_updated_at=now(),updated_at=now() where id=p_listing_id returning * into v_listing;
 if not found then raise exception 'Rental expiry update is not permitted.' using errcode='42501'; end if;
 v_activity_id := public.record_rental_listing_change(p_listing_id,v_before,'expiry');
 return jsonb_build_object('listingId',p_listing_id,'updatedAt',v_listing.updated_at,'facts',v_facts,'activityId',v_activity_id);
end;
$function$;
revoke all on function public.save_rental_listing_expiry_v1(uuid,timestamptz,date) from public,anon;
grant execute on function public.save_rental_listing_expiry_v1(uuid,timestamptz,date) to authenticated;
commit;
