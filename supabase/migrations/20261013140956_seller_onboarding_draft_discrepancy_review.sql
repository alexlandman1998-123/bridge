begin;

-- Keep the pre-submission draft outside seller-controlled form JSON. Existing
-- submissions have no trustworthy historic draft, so are not backfilled.
alter table public.private_listing_seller_onboarding
  add column draft_comparison_json jsonb;

create table seller_save_private.draft_review_commands (
  transaction_id xid8 not null,
  onboarding_id uuid not null,
  primary key (transaction_id, onboarding_id)
);
alter table seller_save_private.draft_review_commands enable row level security;
revoke all on seller_save_private.draft_review_commands from public, anon, authenticated;

create function seller_save_private.draft_review_value(p_value jsonb, p_numeric boolean)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare value text := nullif(btrim(p_value #>> '{}'), '');
begin
  if p_numeric then
    value := regexp_replace(value, '[,[:space:]]', '', 'g');
    if value ~ '^[0-9]+([.][0-9]+)?$' then return to_jsonb(value::numeric); end if;
    return null;
  end if;
  return to_jsonb(value);
end;
$$;

create function seller_save_private.build_draft_comparison(p_existing jsonb, p_draft jsonb, p_form jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  draft jsonb := coalesce(p_existing->'draftValues', p_draft, '{}'::jsonb);
  differences jsonb := '[]'::jsonb;
  field jsonb; draft_value jsonb; seller_value jsonb; previous jsonb; equal_values boolean;
begin
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into draft from jsonb_each(draft)
    where key=any(array['address','property_type','asking_price','bedrooms','bathrooms','garages','parking_bays','floor_size','erf_size','rates_taxes','levies']);
  for field in select value from jsonb_array_elements('[
    {"key":"propertyAddress","label":"Property address","column":"address"},
    {"key":"propertyType","label":"Property type","column":"property_type"},
    {"key":"askingPrice","label":"Asking price","column":"asking_price","numeric":true},
    {"key":"bedrooms","label":"Bedrooms","column":"bedrooms","numeric":true},
    {"key":"bathrooms","label":"Bathrooms","column":"bathrooms","numeric":true},
    {"key":"garages","label":"Garages","column":"garages","numeric":true},
    {"key":"parkingBays","label":"Parking bays","column":"parking_bays","numeric":true},
    {"key":"floorSize","label":"Floor size","column":"floor_size","numeric":true},
    {"key":"erfSize","label":"Erf size","column":"erf_size","numeric":true},
    {"key":"ratesTaxes","label":"Rates and taxes","column":"rates_taxes","numeric":true},
    {"key":"levies","label":"Levies","column":"levies","numeric":true}
  ]'::jsonb) loop
    draft_value := seller_save_private.draft_review_value(draft->(field->>'column'), coalesce((field->>'numeric')::boolean, false));
    seller_value := seller_save_private.draft_review_value(
      case when field->>'key' = 'parkingBays' then coalesce(p_form->'parkingBays',p_form->'parkingCount') else p_form->(field->>'key') end,
      coalesce((field->>'numeric')::boolean, false));
    select value into previous from jsonb_array_elements(coalesce(p_existing->'differences','[]'::jsonb))
      where value->>'key' = field->>'key';
    -- Missing optional information is not a new disagreement. Clearing a
    -- disputed answer must never discard the existing review obligation.
    if draft_value is null then continue; end if;
    if seller_value is null then
      if previous is not null then differences := differences || jsonb_build_array(previous || '{"sellerValue":"","status":"pending"}'::jsonb); end if;
      continue;
    end if;
    equal_values := case when coalesce((field->>'numeric')::boolean,false) then draft_value = seller_value
      else regexp_replace(lower(draft_value#>>'{}'),'[^a-z0-9]+','','g') = regexp_replace(lower(seller_value#>>'{}'),'[^a-z0-9]+','','g') end;
    if equal_values then continue; end if;
    differences := differences || jsonb_build_array(jsonb_build_object(
      'key',field->>'key','label',field->>'label','draftValue',draft_value,'sellerValue',seller_value,
      'status',case when previous->>'status'='accepted' and previous->'draftValue'=draft_value and
        case when coalesce((field->>'numeric')::boolean,false) then previous->'sellerValue'=seller_value
          else regexp_replace(lower(previous->>'sellerValue'),'[^a-z0-9]+','','g')=regexp_replace(lower(seller_value#>>'{}'),'[^a-z0-9]+','','g') end
        then 'accepted' else 'pending' end
    ));
  end loop;
  return jsonb_build_object('draftValues',draft,'capturedAt',coalesce(p_existing->'capturedAt',to_jsonb(clock_timestamp())),
    'differences',differences,'history',coalesce(p_existing->'history','[]'::jsonb));
end;
$$;

create function seller_save_private.guard_draft_comparison()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from seller_save_private.draft_review_commands
    where transaction_id=pg_current_xact_id() and onboarding_id=new.id) then return new; end if;
  if tg_op='INSERT' then
    if new.draft_comparison_json is not null then raise exception 'Draft comparison is managed by seller review.' using errcode='42501'; end if;
  else
    if new.draft_comparison_json is distinct from old.draft_comparison_json then
      raise exception 'Draft comparison is managed by seller review.' using errcode='42501';
    end if;
    if old.draft_comparison_json is not null and new.form_data is distinct from old.form_data then
      new.draft_comparison_json := seller_save_private.build_draft_comparison(old.draft_comparison_json,null,new.form_data);
    end if;
    if new.form_data#>>'{sellerOnboardingReview,status}'='approved'
       and old.form_data#>>'{sellerOnboardingReview,status}' is distinct from 'approved'
       and exists(select 1 from jsonb_array_elements(coalesce(new.draft_comparison_json->'differences','[]'::jsonb)) d
         where d->>'status' is distinct from 'accepted' or new.status<>'completed') then
      raise exception 'Review the differences between the listing draft and seller onboarding before approving it.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_seller_onboarding_draft_comparison before insert or update
on public.private_listing_seller_onboarding for each row execute function seller_save_private.guard_draft_comparison();

create function seller_save_private.capture_draft_comparison(p_onboarding_id uuid, p_form jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare onboarding public.private_listing_seller_onboarding; draft jsonb;
begin
  select * into strict onboarding from public.private_listing_seller_onboarding where id=p_onboarding_id for update;
  select to_jsonb(p) into draft from public.listing_publication_data p where listing_id=onboarding.private_listing_id for update;
  if draft is null then
    select jsonb_build_object('address',coalesce(street_address,address_line_1),'property_type',property_type,'asking_price',asking_price)
      into draft from public.private_listings where id=onboarding.private_listing_id;
  end if;
  insert into seller_save_private.draft_review_commands values(pg_current_xact_id(),p_onboarding_id);
  update public.private_listing_seller_onboarding
    set draft_comparison_json=seller_save_private.build_draft_comparison(onboarding.draft_comparison_json,draft,coalesce(onboarding.form_data,'{}'::jsonb)||p_form)
    where id=p_onboarding_id;
  delete from seller_save_private.draft_review_commands where transaction_id=pg_current_xact_id() and onboarding_id=p_onboarding_id;
end;
$$;

-- Preserve the existing token validation, revision locks, fast receipt and all
-- completion projections. Capture occurs under those locks before overwriting.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.bridge_complete_private_listing_seller_onboarding(text,jsonb,text,text,text)'::regprocedure);
  if strpos(definition,'return seller_save_private.bridge_complete_private_listing_seller_onboarding(')=0 then
    raise exception 'Seller completion wrapper does not match the expected guarded function.';
  end if;
  definition := replace(definition,'return seller_save_private.bridge_complete_private_listing_seller_onboarding(',
    'perform seller_save_private.capture_draft_comparison(v_onboarding.id, p_form_data - ''__sellerSave'');
  return seller_save_private.bridge_complete_private_listing_seller_onboarding(');
  execute definition;
end;
$$;

-- The lead review uses the canonical save RPC. Allow its explicit correction
-- decision to reopen the same token, matching the listing's profile-save route.
do $$
declare definition text; anchor text := 'if v_onboarding.status = ''completed'' or v_onboarding.submitted_at is not null then v_status := ''completed''; end if;';
begin
  definition := pg_get_functiondef('public.save_private_listing_seller_canonical_update(uuid,jsonb,jsonb,jsonb,jsonb,text,text,text,text,uuid,text,text,text[],timestamptz)'::regprocedure);
  if strpos(definition,anchor)=0 then raise exception 'Canonical seller save does not match the expected guarded function.'; end if;
  definition := replace(definition,anchor,
    'if p_onboarding_status = ''in_progress'' and p_form_data#>>''{sellerOnboardingReview,status}'' = ''correction_requested'' then
      if length(trim(coalesce(p_form_data#>>''{sellerOnboardingReview,reason}'',''''))) < 5 or not public.bridge_listing_seller_actor_permission(v_listing.organisation_id,''review_change'',''general'') then
        raise exception ''A seller reviewer and a correction reason are required.'' using errcode=''42501'';
      end if;
      v_status := ''in_progress'';
    elsif v_onboarding.status = ''completed'' or v_onboarding.submitted_at is not null then v_status := ''completed''; end if;');
  definition := replace(definition,
    'submitted_at = case when v_status = ''completed'' then coalesce(submitted_at, v_now) else submitted_at end',
    'submitted_at = case when v_status = ''completed'' then coalesce(submitted_at, v_now) when p_form_data#>>''{sellerOnboardingReview,status}'' = ''correction_requested'' then null else submitted_at end');
  execute definition;
end;
$$;

create function public.accept_seller_onboarding_draft_answer(p_listing_id uuid,p_field text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare listing public.private_listings; onboarding public.private_listing_seller_onboarding; comparison jsonb; item jsonb; differences jsonb := '[]'::jsonb; decision jsonb; found_field boolean := false;
begin
  if auth.uid() is null or not coalesce(public.bridge_can_access_private_listing(p_listing_id),false) then
    raise exception 'You cannot review this seller record.' using errcode='42501';
  end if;
  select * into strict listing from public.private_listings where id=p_listing_id for update;
  if not coalesce(public.bridge_listing_seller_actor_permission(listing.organisation_id,'review_change','general'),false) then
    raise exception 'You cannot review this seller record.' using errcode='42501';
  end if;
  select * into strict onboarding from public.private_listing_seller_onboarding where private_listing_id=p_listing_id for update;
  if onboarding.updated_at is distinct from p_expected_updated_at then
    raise exception 'The seller details changed. Reload and review the latest answer before accepting it.' using errcode='PT409';
  end if;
  if onboarding.status <> 'completed' or coalesce(onboarding.form_data#>>'{sellerOnboardingReview,status}','')='correction_requested' then
    raise exception 'Wait for the seller to resubmit before accepting answers.' using errcode='23514';
  end if;
  comparison := onboarding.draft_comparison_json;
  for item in select value from jsonb_array_elements(coalesce(comparison->'differences','[]'::jsonb)) loop
    if item->>'key'=p_field then
      found_field := true;
      if coalesce(item->>'sellerValue','')='' then
        raise exception 'Ask the seller to supply this answer before accepting it.' using errcode='23514';
      end if;
      if item->>'status'='accepted' then
        return jsonb_build_object('id',onboarding.id,'private_listing_id',p_listing_id,'status',onboarding.status,'form_data',onboarding.form_data,
          'updated_at',onboarding.updated_at,'submitted_at',onboarding.submitted_at,'listing_updated_at',listing.updated_at,'draft_comparison_json',comparison);
      end if;
      decision := item || jsonb_build_object('status','accepted','actor',auth.uid(),'at',clock_timestamp());
      item := item || '{"status":"accepted"}'::jsonb;
    end if;
    differences := differences || jsonb_build_array(item);
  end loop;
  if not found_field then raise exception 'This field has no submitted difference to review.' using errcode='22023'; end if;
  -- The selected answer is also the advertising value. This covers older
  -- completion projections that omitted aliases such as parkingCount.
  update public.listing_publication_data set
    address=case when p_field='propertyAddress' then decision->>'sellerValue' else address end,
    property_type=case when p_field='propertyType' then decision->>'sellerValue' else property_type end,
    asking_price=case when p_field='askingPrice' then (decision->>'sellerValue')::numeric else asking_price end,
    bedrooms=case when p_field='bedrooms' then (decision->>'sellerValue')::integer else bedrooms end,
    bathrooms=case when p_field='bathrooms' then (decision->>'sellerValue')::numeric else bathrooms end,
    garages=case when p_field='garages' then (decision->>'sellerValue')::integer else garages end,
    parking_bays=case when p_field='parkingBays' then (decision->>'sellerValue')::integer else parking_bays end,
    floor_size=case when p_field='floorSize' then (decision->>'sellerValue')::numeric else floor_size end,
    erf_size=case when p_field='erfSize' then (decision->>'sellerValue')::numeric else erf_size end,
    rates_taxes=case when p_field='ratesTaxes' then (decision->>'sellerValue')::numeric else rates_taxes end,
    levies=case when p_field='levies' then (decision->>'sellerValue')::numeric else levies end
    where listing_id=p_listing_id;
  comparison := comparison || jsonb_build_object('differences',differences,'history',coalesce(comparison->'history','[]'::jsonb)||jsonb_build_array(decision));
  insert into seller_save_private.draft_review_commands values(pg_current_xact_id(),onboarding.id);
  update public.private_listing_seller_onboarding set draft_comparison_json=comparison,updated_at=clock_timestamp()
    where id=onboarding.id returning * into onboarding;
  select * into strict listing from public.private_listings where id=p_listing_id;
  delete from seller_save_private.draft_review_commands where transaction_id=pg_current_xact_id() and onboarding_id=onboarding.id;
  insert into public.private_listing_activity(private_listing_id,activity_type,activity_title,activity_description,performed_by,visibility,metadata)
    values(p_listing_id,'seller_draft_difference_reviewed','Seller answer accepted','An agent reviewed a difference between the draft and submitted onboarding.',auth.uid(),'internal',decision);
  return jsonb_build_object('id',onboarding.id,'private_listing_id',p_listing_id,'status',onboarding.status,'form_data',onboarding.form_data,
    'updated_at',onboarding.updated_at,'submitted_at',onboarding.submitted_at,'listing_updated_at',listing.updated_at,'draft_comparison_json',comparison);
end;
$$;
revoke all on function public.accept_seller_onboarding_draft_answer(uuid,text,timestamptz) from public,anon;
grant execute on function public.accept_seller_onboarding_draft_answer(uuid,text,timestamptz) to authenticated;

create function seller_save_private.draft_review_pending(p_listing_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.private_listing_seller_onboarding o,
    lateral jsonb_array_elements(coalesce(o.draft_comparison_json->'differences','[]'::jsonb)) d
    where o.private_listing_id=p_listing_id and (d->>'status' is distinct from 'accepted' or o.status<>'completed'));
$$;

create function public.assert_seller_onboarding_draft_reviewed(p_listing_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     and coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role'
     and (auth.uid() is null or not coalesce(public.bridge_can_access_private_listing(p_listing_id),false)) then
    raise exception 'This listing is unavailable.' using errcode='42501';
  end if;
  if seller_save_private.draft_review_pending(p_listing_id) then
    raise exception 'Review the differences between the listing draft and seller onboarding before publishing.' using errcode='23514';
  end if;
end;
$$;
revoke all on function public.assert_seller_onboarding_draft_reviewed(uuid) from public,anon;
grant execute on function public.assert_seller_onboarding_draft_reviewed(uuid) to authenticated,service_role;

create function seller_save_private.guard_draft_publication()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.status) in ('published','live') and seller_save_private.draft_review_pending(new.listing_id) then
    raise exception 'Review the differences between the listing draft and seller onboarding before publishing.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger guard_seller_draft_publication before insert or update of status on public.listing_publication_data
for each row execute function seller_save_private.guard_draft_publication();
create trigger guard_seller_draft_publication before insert or update on public.website_listing_publications
for each row execute function seller_save_private.guard_draft_publication();
create trigger guard_seller_draft_publication before insert or update on public.website_partner_listing_publications
for each row execute function seller_save_private.guard_draft_publication();

-- Guard queue acceptance and the moment just before background dispatch.
do $$
declare definition text; target regprocedure;
begin
  foreach target in array array['public.enqueue_listing_publication(uuid,text[])'::regprocedure,'public.enqueue_listing_publication_update(uuid,text[],uuid)'::regprocedure] loop
    definition := pg_get_functiondef(target);
    definition := regexp_replace(definition,'\mbegin\M', 'begin
 perform public.assert_seller_onboarding_draft_reviewed(p_listing_id);','i');
    execute definition;
  end loop;
  definition := pg_get_functiondef('public.begin_listing_publication_dispatch(uuid,uuid)'::regprocedure);
  if strpos(definition,'if not found then return false; end if;')=0 then raise exception 'Publication dispatch function differs from expected version.'; end if;
  execute replace(definition,'if not found then return false; end if;', 'if not found then return false; end if;
 if seller_save_private.draft_review_pending(j.listing_id) then
   update public.listing_publication_jobs set state=''failed'',message=''Review the differences between the listing draft and seller onboarding before publishing.'',updated_at=now() where id=j.id;
   return false;
 end if;');
end;
$$;

revoke all on function seller_save_private.draft_review_value(jsonb,boolean),
  seller_save_private.build_draft_comparison(jsonb,jsonb,jsonb),
  seller_save_private.guard_draft_comparison(),
  seller_save_private.capture_draft_comparison(uuid,jsonb),
  seller_save_private.draft_review_pending(uuid),
  seller_save_private.guard_draft_publication() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
