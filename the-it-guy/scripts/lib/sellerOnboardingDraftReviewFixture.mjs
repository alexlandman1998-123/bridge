import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

export const draftReviewIds = {
  listing: '11111111-1111-4111-8111-111111111111',
  onboarding: '22222222-2222-4222-8222-222222222222',
  actor: '33333333-3333-4333-8333-333333333333',
  organisation: '44444444-4444-4444-8444-444444444444',
}

// Synthetic identities and the previous completion projection surround the
// real new migration. No network, Supabase project or provider is involved.
export async function createSellerOnboardingDraftReviewFixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema seller_save_private;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function public.bridge_can_access_private_listing(uuid) returns boolean language sql as $$ select coalesce(current_setting('fixture.access',true),'yes')='yes' $$;
    create function public.bridge_listing_seller_actor_permission(uuid,text,text) returns boolean language sql as $$ select coalesce(current_setting('fixture.review',true),'yes')='yes' $$;
    create table public.private_listings(id uuid primary key,organisation_id uuid,updated_at timestamptz default clock_timestamp(),
      address_line_1 text,street_address text,property_type text,asking_price numeric,mandate_type text,seller_type text,
      seller_onboarding_status text,seller_canonical_facts_json jsonb,seller_canonical_fact_readiness_json jsonb,seller_canonical_facts_updated_at timestamptz);
    create table public.private_listing_seller_onboarding(id uuid primary key,private_listing_id uuid,token text,status text,
      form_data jsonb default '{}',updated_at timestamptz default clock_timestamp(),submitted_at timestamptz,
      seller_type text,ownership_structure text,marital_regime text,canonical_facts_json jsonb,canonical_fact_readiness_json jsonb,canonical_facts_updated_at timestamptz);
    create table public.listing_publication_data(listing_id uuid primary key,address text,property_type text,asking_price numeric,
      bedrooms int,bathrooms numeric,garages int,parking_bays int,floor_size numeric,erf_size numeric,rates_taxes numeric,levies numeric,status text);
    create table public.private_listing_activity(private_listing_id uuid,activity_type text,activity_title text,activity_description text,
      performed_by uuid,visibility text,metadata jsonb);
    create table public.website_listing_publications(listing_id uuid,status text);
    create table public.website_partner_listing_publications(listing_id uuid,status text);
    create table public.listing_publication_jobs(id uuid,listing_id uuid,claim_id uuid,state text,message text,updated_at timestamptz);
    create function seller_save_private.bridge_complete_private_listing_seller_onboarding(p_token text,p_form_data jsonb,p_seller_type text,p_ownership_structure text,p_marital_regime text)
    returns jsonb language plpgsql as $$ declare o public.private_listing_seller_onboarding; begin
      update public.private_listing_seller_onboarding set form_data=form_data||p_form_data,status='completed',submitted_at=clock_timestamp(),updated_at=clock_timestamp()
        where token=p_token returning * into o;
      update public.listing_publication_data set bedrooms=(p_form_data->>'bedrooms')::int where listing_id=o.private_listing_id;
      return jsonb_build_object('onboardingId',o.id,'listingId',o.private_listing_id,'status',o.status,'submittedAt',o.submitted_at);
    end $$;
    create function public.bridge_complete_private_listing_seller_onboarding(p_token text,p_form_data jsonb default '{}',p_seller_type text default null,p_ownership_structure text default null,p_marital_regime text default null)
    returns jsonb language plpgsql as $$ declare v_onboarding public.private_listing_seller_onboarding; begin
      select * into v_onboarding from public.private_listing_seller_onboarding where token=p_token for update;
      if v_onboarding.id is null then return null; end if;
      if v_onboarding.updated_at is distinct from (p_form_data#>>'{__sellerSave,updatedAt}')::timestamptz or v_onboarding.status='completed' then
        raise exception 'Stale seller record' using errcode='PT409'; end if;
      return seller_save_private.bridge_complete_private_listing_seller_onboarding(p_token,p_form_data-'__sellerSave',p_seller_type,p_ownership_structure,p_marital_regime);
    end $$;
    create function public.enqueue_listing_publication(p_listing_id uuid,p_channels text[]) returns jsonb language plpgsql as $$ begin return '[]'::jsonb; end $$;
    create function public.enqueue_listing_publication_update(p_listing_id uuid,p_channels text[],p_request_key uuid) returns jsonb language plpgsql as $$ begin return '[]'::jsonb; end $$;
    create function public.begin_listing_publication_dispatch(p_job uuid,p_claim uuid) returns boolean language plpgsql as $$ declare j public.listing_publication_jobs; begin
      select * into j from public.listing_publication_jobs where id=p_job and claim_id=p_claim;
      if not found then return false; end if;
      update public.listing_publication_jobs set state='dispatching' where id=j.id;
      return true;
    end $$;
  `)
  const original = await readFile(new URL('../../../supabase/migrations/20261010215549_seller_save_concurrency_guards.sql', import.meta.url), 'utf8')
  const start = original.indexOf('create or replace function public.save_private_listing_seller_canonical_update(')
  const end = original.indexOf('\n$$;', start) + 4
  await db.exec(original.slice(start, end))
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261013140956_seller_onboarding_draft_discrepancy_review.sql', import.meta.url), 'utf8'))
  const ids = draftReviewIds
  await db.query('insert into private_listings(id,organisation_id,address_line_1,street_address,asking_price) values($1,$2,$3,$3,2500000)', [ids.listing, ids.organisation, '1 Example Road'])
  await db.query("insert into private_listing_seller_onboarding(id,private_listing_id,token,status,form_data) values($1,$2,'fixture-token','in_progress',$3)", [ids.onboarding, ids.listing, {bedrooms:'5'}])
  await db.query("insert into listing_publication_data(listing_id,address,property_type,asking_price,bedrooms,bathrooms,garages,status) values($1,'1 Example Road','House',2500000,5,2,0,'Draft')", [ids.listing])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids.actor])

  const read = async () => (await db.query('select * from private_listing_seller_onboarding where id=$1',[ids.onboarding])).rows[0]
  const submit = async (form = {bedrooms:'4'}) => {
    const o = await read()
    return (await db.query('select bridge_complete_private_listing_seller_onboarding($1,$2)', ['fixture-token', {...form,__sellerSave:{updatedAt:o.updated_at}}])).rows[0].bridge_complete_private_listing_seller_onboarding
  }
  const accept = async (key = 'bedrooms', expected) => {
    const o = await read()
    return (await db.query('select accept_seller_onboarding_draft_answer($1,$2,$3)', [ids.listing,key,expected || o.updated_at])).rows[0].accept_seller_onboarding_draft_answer
  }
  return {db,ids,read,submit,accept}
}
