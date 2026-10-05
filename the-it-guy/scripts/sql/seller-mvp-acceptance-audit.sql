-- Read-only review candidates, not repair instructions or proof of corruption.
-- Returns identifiers, reason codes and preservation flags only; never names, tokens or document HTML.
-- Read-only by construction; classifications require an agent decision, never automatic repair.
begin read only;
with candidates as (
  select l.id as listing_id, o.id as onboarding_id,
    coalesce(o.form_data, '{}'::jsonb) as form,
    o.status as onboarding_status,
    lower(coalesce(to_jsonb(l)->>'listing_type', l.seller_canonical_facts_json->>'listingType', o.form_data->>'listingType', o.form_data->>'listing_type', 'sale')) as listing_type,
    coalesce(o.canonical_facts_json, '{}'::jsonb) as onboarding_facts,
    coalesce(l.seller_canonical_facts_json, '{}'::jsonb) as listing_facts
  from public.private_listings l
  join public.private_listing_seller_onboarding o on o.private_listing_id = l.id
), copy_rows as (
  select c.listing_id, c.onboarding_id, copy as document, false as historical
  from candidates c cross join lateral jsonb_array_elements(case when jsonb_typeof(coalesce(
    c.form#>'{sellerOnboardingManualSigningPack,documents}', c.form#>'{seller_onboarding_manual_signing_pack,documents}'))='array'
    then coalesce(c.form#>'{sellerOnboardingManualSigningPack,documents}', c.form#>'{seller_onboarding_manual_signing_pack,documents}') else '[]'::jsonb end) copy
  union all
  select c.listing_id, c.onboarding_id, copy, true
  from candidates c cross join lateral jsonb_array_elements(case when jsonb_typeof(coalesce(
    c.form#>'{sellerOnboardingManualSigningPack,versionHistory}', c.form#>'{seller_onboarding_manual_signing_pack,versionHistory}'))='array'
    then coalesce(c.form#>'{sellerOnboardingManualSigningPack,versionHistory}', c.form#>'{seller_onboarding_manual_signing_pack,versionHistory}') else '[]'::jsonb end) version
  cross join lateral jsonb_array_elements(case when jsonb_typeof(version->'documents')='array' then version->'documents' else '[]'::jsonb end) copy
), findings as (
  select listing_id, onboarding_id, 'canonical_facts_differ' as reason
  from candidates where onboarding_facts <> listing_facts
  union all
  select listing_id, onboarding_id, 'captured_form_without_canonical_owner'
  from candidates where (coalesce(nullif(trim(form->>'sellerFirstName'), ''), nullif(trim(form->>'seller_first_name'), ''), nullif(trim(form->>'firstName'), ''), nullif(trim(form->>'companyName'), ''),
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
      when jsonb_typeof(coalesce(c.form#>'{sellerOnboardingManualSigningPack,documents}',c.form#>'{seller_onboarding_manual_signing_pack,documents}')) = 'array'
      then coalesce(c.form#>'{sellerOnboardingManualSigningPack,documents}',c.form#>'{seller_onboarding_manual_signing_pack,documents}') else '[]'::jsonb end) doc
    where coalesce(nullif(doc->>'versionId', ''),nullif(doc->>'version_id', '')) is null
      or coalesce(nullif(doc->>'versionDigest', ''),nullif(doc->>'version_digest', '')) is null
  )
  union all
  select c.listing_id, c.onboarding_id, 'legacy_spouse_upload_requirement'
  from candidates c where exists (
    select 1 from public.private_listing_document_requirements r
    where r.private_listing_id=c.listing_id and r.requirement_key='spouse_consent'
  )
  union all
  select listing_id, onboarding_id, 'legacy_mandate_copy'
  from copy_rows where not historical and coalesce(document->>'key',document->>'requirementKey')='signed_mandate'
    and coalesce(document#>'{mandateTerms,mandateCapture}', 'null'::jsonb)='null'::jsonb
    and coalesce(document->>'templateVersion',document->>'template_version','') !~ '^seller-mandate-(exclusive|open|dual)-'
  union all
  select listing_id, onboarding_id, 'incomplete_full_mandate_version'
  from copy_rows where not historical and coalesce(document->>'key',document->>'requirementKey')='signed_mandate'
    and (coalesce(document#>'{mandateTerms,mandateCapture}', 'null'::jsonb)<>'null'::jsonb
      or coalesce(document->>'templateVersion',document->>'template_version','') ~ '^seller-mandate-(exclusive|open|dual)-')
    and (coalesce(document#>>'{mandateTerms,mandateCapture,version}','')<>'1'
      or coalesce(document#>>'{mandateContract,contract}','')<>'arch9-full-mandate-signing-v1'
      or nullif(document#>>'{mandateContract,version}','') is null
      or jsonb_typeof(document->'requiredSigners') is distinct from 'array')
  union all
  select listing_id, onboarding_id, 'unsupported_mandate_capture_version'
  from candidates where form#>>'{mandateCapture,version}' is not null and form#>>'{mandateCapture,version}'<>'1'
)
, reasons as (
  select listing_id, onboarding_id, array_agg(distinct reason order by reason) as review_reasons
  from findings group by listing_id, onboarding_id
), review as (
  select c.listing_id, c.onboarding_id, c.onboarding_status, c.listing_type, r.review_reasons,
    c.onboarding_facts = c.listing_facts as canonical_facts_match,
    (c.onboarding_facts - 'context') = (c.listing_facts - 'context') as content_facts_match,
    array(select key from jsonb_object_keys(
      case when jsonb_typeof(c.onboarding_facts)='object' then c.onboarding_facts else '{}'::jsonb end ||
      case when jsonb_typeof(c.listing_facts)='object' then c.listing_facts else '{}'::jsonb end
    ) key where c.onboarding_facts->key is distinct from c.listing_facts->key order by key) as differing_sections,
    exists(select 1 from public.private_listing_documents d where d.private_listing_id=c.listing_id
      and lower(coalesce(to_jsonb(d)->>'status','')) in ('signed','completed','complete','approved','reviewed'))
      or exists(select 1 from public.private_listing_seller_portal_signing_documents d where d.private_listing_id=c.listing_id
        and (d.signed_at is not null or d.status in ('partially_signed','signed','reviewed')))
      or exists(select 1 from public.private_listing_seller_portal_signature_evidence e
        join public.private_listing_seller_portal_signing_documents d on d.id=e.signing_document_id where d.private_listing_id=c.listing_id)
      as has_signed_history,
    exists(select 1 from copy_rows d where d.listing_id=c.listing_id and
      (coalesce(nullif(d.document->>'versionId',''),nullif(d.document->>'version_id','')) is not null
        or coalesce(nullif(d.document->>'approvedAt',''),nullif(d.document->>'approved_at','')) is not null))
      or coalesce(c.form#>>'{sellerOnboardingFormalPackApproval,status}',c.form#>>'{seller_onboarding_formal_pack_approval,status}', '')='approved'
      as has_approved_copies,
    exists(select 1 from public.private_listing_seller_portal_signing_documents d where d.private_listing_id=c.listing_id
      and d.status in ('prepared','sent','partially_signed','signed','reviewed')) as has_active_portal_copy,
    exists(select 1 from copy_rows d where d.listing_id=c.listing_id and d.historical) as has_copy_history
  from candidates c join reasons r using(listing_id,onboarding_id)
)
select *, false as automatic_repair_allowed,
  case
    when listing_type in ('rental','rent','to_rent','to_let','letting','lease') then 'outside_seller_sale_scope'
    when 'entity_identity_missing'=any(review_reasons) then 'confirm_legal_owner'
    when not content_facts_match and (has_signed_history or has_approved_copies or has_active_portal_copy) then 'review_conflict_preserve_frozen_copies'
    when not content_facts_match then 'review_canonical_conflict'
    when 'captured_form_without_canonical_owner'=any(review_reasons) then
      case when onboarding_status='completed' then 'review_completed_capture' else 'finish_capture_before_canonical_save' end
    when 'reviewed_copy_without_version'=any(review_reasons) then
      case when has_signed_history or has_approved_copies or has_active_portal_copy then 'review_legacy_copy_preserve_evidence' else 'regenerate_unsigned_draft_on_review' end
    when 'incomplete_full_mandate_version'=any(review_reasons) or 'unsupported_mandate_capture_version'=any(review_reasons) then 'review_mandate_compatibility_preserve_copies'
    when 'legacy_mandate_copy'=any(review_reasons) then
      case when has_signed_history or has_approved_copies or has_active_portal_copy then 'preserve_legacy_mandate_review_replacement' else 'review_unsigned_mandate_before_preparation' end
    when 'legacy_spouse_upload_requirement'=any(review_reasons) then 'review_legacy_requirement'
    else 'metadata_difference_no_content_repair'
  end as recommended_action
from review order by listing_id,onboarding_id;
commit;
