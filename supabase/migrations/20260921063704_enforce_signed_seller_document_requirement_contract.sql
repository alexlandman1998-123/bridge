-- A completed seller-signing document and its requirement are one aggregate.
-- Enforce that invariant at the table boundary so every writer (current pack,
-- legacy one-at-a-time signing, repair jobs and service tooling) produces the
-- same canonical relationship.

create or replace function public.bridge_link_signed_seller_document_requirement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requirement_key text;
  v_requirement_name text;
  v_requirement_group text;
  v_requirement_id uuid;
begin
  v_requirement_key := case lower(coalesce(new.document_type, ''))
    when 'signed_mandate' then 'signed_mandate'
    when 'signed_fica_declaration' then 'signed_fica_declaration'
    when 'signed_disclosure_form' then 'signed_disclosure_form'
    else null
  end;

  if v_requirement_key is null then
    return new;
  end if;

  v_requirement_name := case v_requirement_key
    when 'signed_mandate' then 'Signed Mandate'
    when 'signed_fica_declaration' then 'Signed FICA Declaration'
    else 'Signed Mandatory Disclosure / Defects Form'
  end;
  v_requirement_group := case v_requirement_key
    when 'signed_mandate' then 'mandate'
    when 'signed_fica_declaration' then 'fica'
    else 'compliance'
  end;

  insert into public.private_listing_document_requirements as requirement (
    private_listing_id,
    requirement_key,
    requirement_name,
    requirement_description,
    requirement_group,
    document_visibility,
    status,
    is_required,
    generated_from
  ) values (
    new.private_listing_id,
    v_requirement_key,
    v_requirement_name,
    'Canonical requirement automatically linked to the immutable signed seller document.',
    v_requirement_group,
    'seller_visible',
    case when lower(coalesce(new.status, '')) in ('completed', 'approved') then 'completed' else 'required' end,
    true,
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'signed_seller_document_contract',
      'signingSessionId', new.signing_session_id,
      'documentId', new.id
    ))
  )
  on conflict (private_listing_id, requirement_key)
  do update set
    requirement_name = excluded.requirement_name,
    requirement_group = excluded.requirement_group,
    document_visibility = 'seller_visible',
    status = case
      when lower(coalesce(new.status, '')) in ('completed', 'approved') then 'completed'
      else requirement.status
    end,
    is_required = true,
    generated_from = coalesce(requirement.generated_from, '{}'::jsonb) || excluded.generated_from,
    updated_at = now()
  returning id into v_requirement_id;

  new.requirement_id := v_requirement_id;
  return new;
end;
$$;

drop trigger if exists trg_private_listing_documents_signed_requirement_contract
  on public.private_listing_documents;
create trigger trg_private_listing_documents_signed_requirement_contract
before insert or update of private_listing_id, document_type, requirement_id, status
on public.private_listing_documents
for each row
execute function public.bridge_link_signed_seller_document_requirement();

-- Repair existing rows by adding canonical requirements and linking them. No
-- signed content, storage object, signature or historical row is replaced.
insert into public.private_listing_document_requirements as requirement (
  private_listing_id,
  requirement_key,
  requirement_name,
  requirement_description,
  requirement_group,
  document_visibility,
  status,
  is_required,
  generated_from
)
select distinct on (document.private_listing_id, document.document_type)
  document.private_listing_id,
  document.document_type,
  case document.document_type
    when 'signed_mandate' then 'Signed Mandate'
    when 'signed_fica_declaration' then 'Signed FICA Declaration'
    else 'Signed Mandatory Disclosure / Defects Form'
  end,
  'Canonical requirement linked to existing immutable signed seller evidence.',
  case document.document_type
    when 'signed_mandate' then 'mandate'
    when 'signed_fica_declaration' then 'fica'
    else 'compliance'
  end,
  'seller_visible',
  'completed',
  true,
  jsonb_strip_nulls(jsonb_build_object(
    'source', 'signed_seller_document_contract_backfill',
    'signingSessionId', document.signing_session_id,
    'documentId', document.id
  ))
from public.private_listing_documents document
where lower(coalesce(document.document_type, '')) in (
  'signed_mandate',
  'signed_fica_declaration',
  'signed_disclosure_form'
)
  and lower(coalesce(document.status, '')) in ('completed', 'approved')
order by document.private_listing_id, document.document_type, document.uploaded_at desc, document.id
on conflict (private_listing_id, requirement_key)
do update set
  requirement_name = excluded.requirement_name,
  requirement_group = excluded.requirement_group,
  document_visibility = 'seller_visible',
  status = 'completed',
  is_required = true,
  generated_from = coalesce(requirement.generated_from, '{}'::jsonb) || excluded.generated_from,
  updated_at = now();

update public.private_listing_documents document
set requirement_id = requirement.id,
    updated_at = now()
from public.private_listing_document_requirements requirement
where requirement.private_listing_id = document.private_listing_id
  and requirement.requirement_key = lower(document.document_type)
  and lower(coalesce(document.document_type, '')) in (
    'signed_mandate',
    'signed_fica_declaration',
    'signed_disclosure_form'
  )
  and lower(coalesce(document.status, '')) in ('completed', 'approved')
  and document.requirement_id is distinct from requirement.id;

revoke all on function public.bridge_link_signed_seller_document_requirement()
  from public, anon, authenticated;

comment on function public.bridge_link_signed_seller_document_requirement() is
  'Enforces the canonical requirement relationship for every signed seller document write, independent of the calling workflow.';
