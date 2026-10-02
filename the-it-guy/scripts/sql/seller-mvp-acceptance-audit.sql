-- Read-only review candidates, not repair instructions or proof of corruption.
-- Returns identifiers and reason codes only; never names, tokens or document HTML.
with candidates as (
  select l.id as listing_id, o.id as onboarding_id,
    coalesce(o.form_data, '{}'::jsonb) as form,
    coalesce(o.canonical_facts_json, '{}'::jsonb) as onboarding_facts,
    coalesce(l.seller_canonical_facts_json, '{}'::jsonb) as listing_facts
  from public.private_listings l
  join public.private_listing_seller_onboarding o on o.private_listing_id = l.id
), findings as (
  select listing_id, onboarding_id, 'canonical_facts_differ' as reason
  from candidates where onboarding_facts <> listing_facts
  union all
  select listing_id, onboarding_id, 'captured_form_without_canonical_owner'
  from candidates where (coalesce(nullif(trim(form->>'sellerFirstName'), ''), nullif(trim(form->>'companyName'), ''),
      nullif(trim(form->>'trustName'), ''), nullif(trim(form->>'deceasedEstateName'), ''),
      nullif(trim(form->>'powerOfAttorneyPrincipalName'), '')) is not null
      or (jsonb_typeof(form->'multipleOwners')='array' and form->'multipleOwners'<>'[]'::jsonb))
    and coalesce(onboarding_facts->'seller', '{}'::jsonb) = '{}'::jsonb
  union all
  select listing_id, onboarding_id, 'entity_identity_missing'
  from candidates where case form->>'ownerStructureType'
    when 'company' then nullif(trim(form->>'companyName'), '') is null
    when 'close_corporation' then nullif(trim(form->>'companyName'), '') is null
    when 'foreign_company' then nullif(trim(form->>'companyName'), '') is null
    when 'trust' then nullif(trim(form->>'trustName'), '') is null
    when 'foreign_trust' then nullif(trim(form->>'trustName'), '') is null
    when 'deceased_estate' then nullif(trim(form->>'deceasedEstateName'), '') is null
    when 'power_of_attorney' then nullif(trim(form->>'powerOfAttorneyPrincipalName'), '') is null
    else false end
  union all
  select c.listing_id, c.onboarding_id, 'reviewed_copy_without_version'
  from candidates c where exists (
    select 1 from jsonb_array_elements(case
      when jsonb_typeof(c.form#>'{sellerOnboardingManualSigningPack,documents}') = 'array'
      then c.form#>'{sellerOnboardingManualSigningPack,documents}' else '[]'::jsonb end) doc
    where nullif(doc->>'versionId', '') is null or nullif(doc->>'versionDigest', '') is null
  )
  union all
  select c.listing_id, c.onboarding_id, 'legacy_spouse_upload_requirement'
  from candidates c where exists (
    select 1 from public.private_listing_document_requirements r
    where r.private_listing_id=c.listing_id and r.requirement_key='spouse_consent'
  )
)
select listing_id, onboarding_id, array_agg(distinct reason order by reason) as review_reasons
from findings group by listing_id, onboarding_id order by listing_id, onboarding_id;
