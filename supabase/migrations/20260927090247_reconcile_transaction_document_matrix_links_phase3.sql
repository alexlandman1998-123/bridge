begin;

-- Phase 3 repairs only unlinked compatibility rows. A transaction requirement
-- remains the owner of review state; this does not copy or approve a file.
-- Keep the alias list deliberately narrow: the general taxonomy map groups
-- some different legal requests under one broad document family.
with candidates as (
  select
    legacy.id as legacy_id,
    instance.id as instance_id,
    count(*) over (partition by legacy.id) as candidate_count,
    count(*) over (partition by instance.id) as legacy_count
  from public.transaction_required_documents legacy
  join public.document_requirement_instances instance
    on instance.context_type = 'transaction'
   and instance.context_id = legacy.transaction_id
   and instance.status <> 'not_applicable'
   and instance.requested_from_role = legacy.required_from_role
   and instance.document_definition_key = case
     when legacy.document_key = 'grant_signed' then 'grant_letter'
     else legacy.document_key
   end
  where legacy.canonical_requirement_instance_id is null
    and not exists (
      select 1
      from public.transaction_required_documents linked
      where linked.canonical_requirement_instance_id = instance.id
        and linked.id <> legacy.id
    )
), unique_candidates as (
  select legacy_id, instance_id
  from candidates
  where candidate_count = 1
    and legacy_count = 1
)
update public.transaction_required_documents legacy
set canonical_requirement_instance_id = candidate.instance_id
from unique_candidates candidate
where legacy.id = candidate.legacy_id
  and legacy.canonical_requirement_instance_id is null;

-- Older seller-owned requests were labelled Buyer & FICA by the fallback
-- projector. Do not alter their upload or review state.
update public.transaction_required_documents
set group_key = 'seller_documents',
    group_label = 'Seller Documents'
where group_key = 'buyer_fica'
  and required_from_role = 'seller';

commit;
