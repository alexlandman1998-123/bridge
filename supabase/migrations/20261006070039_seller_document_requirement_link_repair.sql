-- Repair only uniquely identifiable pending files; missing/ambiguous checklists
-- remain visible for staff to confirm. Never infer ownership facts or approve a file.
begin;

lock table public.private_listing_documents,
  public.private_listing_document_requirements in share row exclusive mode;

alter table public.seller_document_review_events
  drop constraint seller_document_review_events_action_check;
alter table public.seller_document_review_events
  add constraint seller_document_review_events_action_check
  check (action in ('start_review', 'approve', 'reject', 'manual_reminder', 'link_requirement'));

with candidates as (
  select document.id as document_id, requirement.id as requirement_id,
    requirement.canonical_requirement_instance_id, requirement.status as requirement_status,
    count(*) over (partition by document.id) as match_count
  from public.private_listing_documents document
  join public.private_listing_document_requirements requirement
    on requirement.private_listing_id = document.private_listing_id
   and public.bridge_normalize_seller_document_key_p0_4(requirement.requirement_key)
       = public.bridge_normalize_seller_document_key_p0_4(document.document_type)
  where document.requirement_id is null
    and document.status in ('uploaded', 'under_review')
    and document.document_type is distinct from 'listing_document'
    and coalesce(document.category, '') <> 'buyer_offer'
    and nullif(public.bridge_normalize_seller_document_key_p0_4(document.document_type), '') is not null
    and requirement.is_required is not false
    and requirement.status <> 'not_applicable'
    and (document.canonical_requirement_instance_id is null
      or document.canonical_requirement_instance_id = requirement.canonical_requirement_instance_id)
    and (requirement.canonical_requirement_instance_id is null or exists (
      select 1 from public.document_requirement_instances canonical
      where canonical.id = requirement.canonical_requirement_instance_id
        and canonical.context_type = 'private_listing'
        and (canonical.context_id = document.private_listing_id or canonical.listing_id = document.private_listing_id)
        and public.bridge_normalize_seller_document_key_p0_4(canonical.document_definition_key)
          = public.bridge_normalize_seller_document_key_p0_4(requirement.requirement_key)
    ))
), repaired as (
  update public.private_listing_documents document
  set requirement_id = candidate.requirement_id,
      canonical_requirement_instance_id = candidate.canonical_requirement_instance_id,
      review_revision = coalesce(document.review_revision, 0) + 1,
      updated_at = now()
  from candidates candidate
  where document.id = candidate.document_id and candidate.match_count = 1
    and candidate.requirement_status not in ('approved', 'completed')
  returning document.*
)
insert into public.seller_document_review_events (
  organisation_id, private_listing_id, requirement_id, document_id, action,
  previous_status, next_status, reason, actor_id, review_revision, metadata
)
select listing.organisation_id, repaired.private_listing_id, repaired.requirement_id,
  repaired.id, 'link_requirement', repaired.status, repaired.status,
  'Recovered one exact active requirement on the same listing; file remains pending review.',
  null, repaired.review_revision,
  jsonb_build_object('source', '20261006070039_seller_document_requirement_link_repair',
    'previousRequirementId', null, 'requirementId', repaired.requirement_id)
from repaired
join public.private_listings listing on listing.id = repaired.private_listing_id;

-- Staff can retry the same conservative repair after correcting ownership facts.
-- Uses the same listing authority as the existing seller document review command.
create or replace function public.bridge_repair_private_listing_seller_document_links(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.private_listings%rowtype;
  v_count integer;
  v_remaining integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in before repairing seller document links.' using errcode = '42501';
  end if;
  select * into v_listing from public.private_listings where id = p_listing_id for share;
  if not found or (
    not coalesce(public.bridge_is_org_admin(v_listing.organisation_id), false)
    and v_listing.assigned_agent_id is distinct from auth.uid()
    and v_listing.created_by is distinct from auth.uid()
  ) then
    raise exception 'You are not authorised to repair this listing.' using errcode = '42501';
  end if;
  if not coalesce(public.bridge_is_active_member(v_listing.organisation_id), false) then
    raise exception 'Active organisation membership is required.' using errcode = '42501';
  end if;
  perform id from public.private_listing_documents where private_listing_id = p_listing_id order by id for update;
  perform id from public.private_listing_document_requirements where private_listing_id = p_listing_id order by id for update;
with candidates as (
  select document.id as document_id, requirement.id as requirement_id,
    requirement.canonical_requirement_instance_id, requirement.status as requirement_status,
    count(*) over (partition by document.id) as match_count
  from public.private_listing_documents document
  join public.private_listing_document_requirements requirement
    on requirement.private_listing_id = document.private_listing_id
   and public.bridge_normalize_seller_document_key_p0_4(requirement.requirement_key)
       = public.bridge_normalize_seller_document_key_p0_4(document.document_type)
  where document.private_listing_id = p_listing_id
    and document.requirement_id is null
    and document.status in ('uploaded', 'under_review')
    and document.document_type is distinct from 'listing_document'
    and coalesce(document.category, '') <> 'buyer_offer'
    and nullif(public.bridge_normalize_seller_document_key_p0_4(document.document_type), '') is not null
    and requirement.is_required is not false
    and requirement.status <> 'not_applicable'
    and (document.canonical_requirement_instance_id is null
      or document.canonical_requirement_instance_id = requirement.canonical_requirement_instance_id)
    and (requirement.canonical_requirement_instance_id is null or exists (
      select 1 from public.document_requirement_instances canonical
      where canonical.id = requirement.canonical_requirement_instance_id
        and canonical.context_type = 'private_listing'
        and (canonical.context_id = document.private_listing_id or canonical.listing_id = document.private_listing_id)
        and public.bridge_normalize_seller_document_key_p0_4(canonical.document_definition_key)
          = public.bridge_normalize_seller_document_key_p0_4(requirement.requirement_key)
    ))
), repaired as (
  update public.private_listing_documents document
  set requirement_id = candidate.requirement_id,
      canonical_requirement_instance_id = candidate.canonical_requirement_instance_id,
      review_revision = coalesce(document.review_revision, 0) + 1,
      updated_at = now()
  from candidates candidate
  where document.id = candidate.document_id and candidate.match_count = 1
    and candidate.requirement_status not in ('approved', 'completed')
  returning document.*
)
insert into public.seller_document_review_events (
  organisation_id, private_listing_id, requirement_id, document_id, action,
  previous_status, next_status, reason, actor_id, review_revision, metadata
)
select listing.organisation_id, repaired.private_listing_id, repaired.requirement_id,
  repaired.id, 'link_requirement', repaired.status, repaired.status,
  'Recovered one exact active requirement on the same listing; file remains pending review.',
  auth.uid(), repaired.review_revision,
  jsonb_build_object('source', '20261006070039_seller_document_requirement_link_repair',
    'previousRequirementId', null, 'requirementId', repaired.requirement_id)
from repaired
join public.private_listings listing on listing.id = repaired.private_listing_id;
  get diagnostics v_count = row_count;
  select count(*) into v_remaining from public.private_listing_documents
  where private_listing_id = p_listing_id and requirement_id is null
    and status in ('uploaded', 'under_review')
    and document_type is distinct from 'listing_document'
    and coalesce(category, '') <> 'buyer_offer';
  return jsonb_build_object('ok', true, 'linkedCount', v_count, 'remainingCount', v_remaining);
end;
$$;
revoke all on function public.bridge_repair_private_listing_seller_document_links(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.bridge_repair_private_listing_seller_document_links(uuid) to authenticated;

-- Existing legacy rows remain readable. New seller-facing files must carry their
-- persisted checklist link, including when an older client bypasses app validation.
create or replace function public.bridge_require_new_seller_document_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility in ('seller_visible', 'client_visible') and new.requirement_id is null then
    raise exception 'Select an exact active seller requirement before uploading this file.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.bridge_require_new_seller_document_link() from public, anon, authenticated, service_role;
create trigger trg_require_new_seller_document_link
before insert on public.private_listing_documents
for each row execute function public.bridge_require_new_seller_document_link();

commit;
