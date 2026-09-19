begin;

-- Replacement is an audit event, not an edit. A later signing group receives
-- a new frozen snapshot while the old sessions remain as evidence.
create table if not exists public.private_listing_signing_pack_replacements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  superseded_signing_group_id uuid not null,
  replacement_signing_group_id uuid not null unique,
  reason text not null check (char_length(trim(reason)) between 5 and 1000),
  initiated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists private_listing_signing_pack_replacements_listing_idx
  on public.private_listing_signing_pack_replacements (private_listing_id, created_at desc);

alter table public.private_listing_signing_pack_replacements enable row level security;
revoke all on table public.private_listing_signing_pack_replacements from public, anon, authenticated;

create or replace function public.bridge_replace_listing_seller_signing_pack(
  p_listing_id uuid,
  p_superseded_signing_group_id uuid,
  p_replacement_signing_group_id uuid,
  p_reason text,
  p_initiated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.private_listing_mandate_signing_sessions%rowtype;
  v_active_count integer;
  v_signed_count integer;
  v_replacement_id uuid;
begin
  select * into v_session
  from public.private_listing_mandate_signing_sessions
  where private_listing_id = p_listing_id
    and signing_group_id = p_superseded_signing_group_id
  order by created_at
  limit 1
  for update;

  if not found then
    raise exception 'The seller signing pack to replace was not found.';
  end if;
  -- Lock every sibling before deciding whether the group may be replaced, so
  -- a concurrent signature cannot turn this into an in-place amendment.
  perform 1 from public.private_listing_mandate_signing_sessions
  where signing_group_id = p_superseded_signing_group_id
  for update;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Provide a short reason for replacing this seller signing pack.';
  end if;
  if exists (
    select 1 from public.private_listing_mandate_signing_sessions
    where signing_group_id = p_superseded_signing_group_id
    group by signing_group_id
    having bool_and(status = 'signed')
  ) then
    raise exception 'A fully signed seller pack cannot be replaced. Start the formal amendment process instead.';
  end if;

  select count(*) filter (where status = 'active'), count(*) filter (where status = 'signed')
  into v_active_count, v_signed_count
  from public.private_listing_mandate_signing_sessions
  where signing_group_id = p_superseded_signing_group_id;

  update public.private_listing_mandate_signing_sessions
  set status = 'revoked', updated_at = now()
  where signing_group_id = p_superseded_signing_group_id and status = 'active';

  insert into public.private_listing_signing_pack_replacements (
    organisation_id, private_listing_id, superseded_signing_group_id,
    replacement_signing_group_id, reason, initiated_by
  ) values (
    v_session.organisation_id, p_listing_id, p_superseded_signing_group_id,
    p_replacement_signing_group_id, trim(p_reason), p_initiated_by
  ) returning id into v_replacement_id;

  insert into public.private_listing_activity (
    private_listing_id, activity_type, activity_title, activity_description, visibility, metadata
  ) values (
    p_listing_id, 'seller_signing_pack_replaced', 'Seller signing pack replaced',
    'Active seller signing links were revoked and a replacement pack was prepared. Reason: ' || trim(p_reason),
    'internal', jsonb_build_object(
      'replacementId', v_replacement_id,
      'supersededSigningGroupId', p_superseded_signing_group_id,
      'replacementSigningGroupId', p_replacement_signing_group_id,
      'activeSessionsRevoked', v_active_count,
      'signedSessionsRetained', v_signed_count,
      'reason', trim(p_reason)
    )
  );

  return jsonb_build_object('replacementId', v_replacement_id, 'activeSessionsRevoked', v_active_count, 'signedSessionsRetained', v_signed_count);
end;
$$;

revoke all on function public.bridge_replace_listing_seller_signing_pack(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.bridge_replace_listing_seller_signing_pack(uuid, uuid, uuid, text, uuid) to service_role;

commit;
