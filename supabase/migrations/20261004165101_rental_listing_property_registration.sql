begin;

-- Inventory identity is separate from a signed mandate, a vacancy or a lease.
alter table public.private_listings
  add column rental_property_id uuid references public.rental_properties(id) on delete restrict,
  add column rental_unit_id uuid references public.rental_units(id) on delete restrict;
create index private_listings_rental_unit_idx on public.private_listings(rental_unit_id) where rental_unit_id is not null;

create function public.rental_listing_register_inventory()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_property public.rental_properties%rowtype;
  v_unit public.rental_units%rowtype;
  v_facts jsonb := coalesce(new.seller_canonical_facts_json, '{}'::jsonb);
  v_address text;
  v_normalized text;
  v_label text;
  v_type text;
  v_property_id uuid;
  v_unit_id uuid;
  v_actor uuid := coalesce(auth.uid(), new.created_by, new.assigned_agent_id);
begin
  if new.listing_category is distinct from 'rental' then
    if new.rental_property_id is not null or new.rental_unit_id is not null then
      raise exception 'Only rental listings may link rental inventory.' using errcode = '22023';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.rental_property_id is not null then
    if new.organisation_id is distinct from old.organisation_id or new.branch_id is distinct from old.branch_id
       or new.rental_property_id is distinct from old.rental_property_id or new.rental_unit_id is distinct from old.rental_unit_id then
      raise exception 'Rental inventory identity cannot be reassigned by editing a listing.' using errcode = '42501';
    end if;
  end if;
  v_property_id := coalesce(new.rental_property_id, nullif(v_facts->>'propertyId', '')::uuid);
  v_unit_id := coalesce(new.rental_unit_id, nullif(v_facts->>'unitId', '')::uuid);
  if v_unit_id is not null then
    select * into v_unit from public.rental_units where id = v_unit_id;
    if not found or v_unit.organisation_id <> new.organisation_id or v_unit.branch_id is distinct from new.branch_id
       or (v_property_id is not null and v_unit.property_id <> v_property_id) then
      raise exception 'Rental unit is unavailable or outside this listing workspace.' using errcode = '42501';
    end if;
    v_property_id := v_unit.property_id;
  end if;
  if v_property_id is not null then
    select * into v_property from public.rental_properties where id = v_property_id;
    if not found or v_property.organisation_id <> new.organisation_id or v_property.branch_id is distinct from new.branch_id
       or v_property.status = 'archived' then
      raise exception 'Rental property is unavailable or outside this listing workspace.' using errcode = '42501';
    end if;
  else
    v_address := coalesce(nullif(btrim(new.address_line_1), ''), nullif(btrim(new.street_address), ''), nullif(btrim(v_facts->>'propertyAddress'), ''));
    if v_address is null then
      -- Historical incomplete shells can still be withdrawn or repaired. A new
      -- rental must have enough identity to register an actual property.
      if tg_op = 'INSERT' then raise exception 'Property address is required to register rental inventory.' using errcode = '22023'; end if;
      return new;
    end if;
    v_normalized := lower(concat_ws('|', v_address, nullif(btrim(new.suburb), ''), nullif(btrim(new.city), ''), nullif(btrim(new.province), ''), nullif(btrim(new.postal_code), '')));
    v_type := lower(coalesce(new.property_type, 'other'));
    if v_type not in ('house','apartment','townhouse','duplex','studio','estate','commercial','other') then v_type := 'other'; end if;
    insert into public.rental_properties(organisation_id, branch_id, assigned_manager_id, name, property_type, status,
      address_line_1, suburb, city, province, postal_code, address_normalized, created_by, metadata_json)
    values(new.organisation_id, new.branch_id, new.assigned_agent_id, coalesce(nullif(btrim(new.title), ''), v_address), v_type, 'active',
      v_address, nullif(btrim(new.suburb), ''), coalesce(new.city, ''), nullif(btrim(new.province), ''), nullif(btrim(new.postal_code), ''), v_normalized, v_actor,
      jsonb_build_object('sourceListingId', new.id, 'addressReviewRequired', nullif(btrim(new.city), '') is null))
    on conflict (organisation_id, address_normalized) where status <> 'archived' do nothing;
    select * into v_property from public.rental_properties
      where organisation_id = new.organisation_id and address_normalized = v_normalized and status <> 'archived';
    if not found or v_property.branch_id is distinct from new.branch_id then
      raise exception 'Matching rental property is unavailable in this branch. Select the correct property before saving.' using errcode = '42501';
    end if;
  end if;
  if v_property.status = 'draft' then
    update public.rental_properties set status = 'active' where id = v_property.id returning * into v_property;
    if not found then raise exception 'Rental property activation was denied.' using errcode = '42501'; end if;
  end if;
  if v_unit.id is null then
    v_label := upper(regexp_replace(coalesce(nullif(btrim(v_facts #>> '{addressProfile,unitNumber}'), ''), 'MAIN'), '[[:space:]]+', ' ', 'g'));
    select * into v_unit from public.rental_units where property_id = v_property.id and upper(unit_label) = v_label;
    if not found then
      if v_label = 'MAIN' and exists(select 1 from public.rental_units where property_id = v_property.id) then
        raise exception 'Choose a unit number for this existing multi-unit property.' using errcode = '22023';
      end if;
      insert into public.rental_units(organisation_id, property_id, branch_id, unit_label, bedrooms, bathrooms, parking_count,
        floor_area_sqm, target_rent, deposit_amount, available_from, status, created_by, metadata_json)
      values(new.organisation_id, v_property.id, new.branch_id, v_label,
        coalesce(nullif(v_facts #>> '{propertyProfile,bedrooms}', '')::numeric, 0),
        coalesce(nullif(v_facts #>> '{propertyProfile,bathrooms}', '')::numeric, 0),
        coalesce(nullif(v_facts #>> '{propertyProfile,parkingBays}', '')::integer, 0),
        nullif(v_facts #>> '{propertyProfile,floorSize}', '')::numeric,
        case when coalesce(v_facts #>> '{rentalInfo,rentalPriceFrequency}', 'monthly') = 'monthly' then coalesce(new.asking_price, 0) else 0 end,
        coalesce(nullif(v_facts #>> '{rentalInfo,depositAmount}', '')::numeric, 0),
        nullif(v_facts #>> '{rentalInfo,availableFrom}', '')::date, 'vacant', v_actor,
        jsonb_build_object('sourceListingId', new.id, 'rentalPriceFrequency', coalesce(v_facts #>> '{rentalInfo,rentalPriceFrequency}', 'monthly')))
      on conflict (property_id, upper(unit_label)) do nothing;
      select * into v_unit from public.rental_units where property_id = v_property.id and upper(unit_label) = v_label;
    end if;
  end if;
  if v_unit.id is null or v_unit.organisation_id <> new.organisation_id or v_unit.branch_id is distinct from new.branch_id then
    raise exception 'Rental unit registration was denied.' using errcode = '42501';
  end if;
  new.rental_property_id := v_property.id;
  new.rental_unit_id := v_unit.id;
  return new;
end; $$;
revoke all on function public.rental_listing_register_inventory() from public, anon, authenticated;
create trigger rental_listing_register_inventory before insert or update of
  address_line_1, city, asking_price, organisation_id, branch_id, listing_category, rental_property_id, rental_unit_id
  on public.private_listings for each row execute function public.rental_listing_register_inventory();

-- Repair existing identifiable stock in the release transaction. Exceptions
-- abort the release rather than silently leaving partial or ambiguous inventory.
update public.private_listings set address_line_1 = address_line_1
where listing_category = 'rental' and rental_property_id is null
  and listing_visibility <> 'archived' and listing_status <> 'withdrawn'
  and coalesce(nullif(btrim(address_line_1), ''), nullif(btrim(street_address), ''), nullif(btrim(seller_canonical_facts_json->>'propertyAddress'), '')) is not null;
commit;
