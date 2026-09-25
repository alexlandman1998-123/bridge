-- Historical digitally signed seller mandates are evidence, not an automatic
-- authority to advance a listing. Each record enters a human review queue and
-- only an explicitly grandfathered record can release a downstream handoff.
create table public.private_listing_mandate_execution_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  source_listing_id uuid references public.private_listings(id) on delete set null,
  source_signing_session_id uuid unique references public.private_listing_mandate_signing_sessions(id) on delete set null,
  classification text not null default 'legal_review_required' check (classification in (
    'grandfathered_valid',
    'wet_ink_reexecution_required',
    'legal_review_required',
    'not_applicable'
  )),
  review_status text not null default 'pending' check (review_status in ('pending', 'in_review', 'resolved')),
  downstream_release boolean not null default false,
  review_reason text,
  source_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(source_snapshot) = 'object'),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    not downstream_release
    or (
      classification = 'grandfathered_valid'
      and review_status = 'resolved'
      and reviewed_by is not null
      and reviewed_at is not null
      and nullif(btrim(coalesce(review_reason, '')), '') is not null
    )
  )
);

create index private_listing_mandate_execution_reviews_queue_idx
  on public.private_listing_mandate_execution_reviews (organisation_id, review_status, classification, created_at asc);

alter table public.private_listing_mandate_execution_reviews enable row level security;
revoke all on table public.private_listing_mandate_execution_reviews from public, anon, authenticated;
grant all on table public.private_listing_mandate_execution_reviews to service_role;

insert into public.private_listing_mandate_execution_reviews (
  organisation_id,
  source_listing_id,
  source_signing_session_id,
  source_snapshot
)
select
  session.organisation_id,
  session.private_listing_id,
  session.id,
  jsonb_build_object(
    'sessionId', session.id,
    'sessionStatus', session.status,
    'signedAt', session.signed_at,
    'createdAt', session.created_at,
    'expiresAt', session.expires_at,
    'selectedDocuments', coalesce(session.selected_documents, '[]'::jsonb)
  )
from public.private_listing_mandate_signing_sessions as session
where session.status = 'signed'
   or session.signed_at is not null
   or session.signature is not null
on conflict (source_signing_session_id) do nothing;

create or replace function public.bridge_sync_signed_mandate_transfer_attorney_handoff()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.status = 'signed'
     and old.status is distinct from 'signed'
     and coalesce(new.selected_documents, '[]'::jsonb) ? 'mandate'
     and not exists (
       select 1
       from public.private_listing_mandate_signing_sessions sibling
       where sibling.signing_group_id = new.signing_group_id
         and sibling.id <> new.id
         and sibling.status <> 'signed'
     ) then
    if not exists (
      select 1
      from public.private_listing_mandate_execution_reviews review
      where review.source_signing_session_id = new.id
        and review.classification = 'grandfathered_valid'
        and review.review_status = 'resolved'
        and review.downstream_release is true
    ) then
      raise exception 'A historical mandate execution review must explicitly release this record before attorney handoff.' using errcode = 'P0001';
    end if;

    perform public.bridge_handoff_signed_mandate_transfer_attorney(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.bridge_handoff_signed_mandate_transfer_attorney(uuid) from public, anon, authenticated, service_role;

comment on table public.private_listing_mandate_execution_reviews is
  'Human review queue for historical seller mandate execution records. It preserves evidence while blocking automatic downstream reliance until a legal decision is recorded.';
