-- The OTP/offer is executed only through reviewed wet-ink evidence. This is
-- deliberately separate from the legacy offer status vocabulary so it cannot
-- revive a digital signing or transaction-first route.
create table public.offer_wet_ink_execution_records (
  offer_id uuid primary key references public.offers(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  listing_id uuid references public.private_listings(id) on delete set null,
  status text not null default 'not_prepared' check (status in (
    'not_prepared', 'awaiting_buyer_wet_ink', 'awaiting_seller_wet_ink',
    'awaiting_review', 'fully_executed', 'rejected'
  )),
  printable_pack_document_id uuid references public.private_listing_documents(id) on delete set null,
  buyer_signed_document_id uuid references public.private_listing_documents(id) on delete set null,
  seller_signed_document_id uuid references public.private_listing_documents(id) on delete set null,
  prepared_by uuid references auth.users(id) on delete set null,
  prepared_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status <> 'fully_executed'
    or (buyer_signed_document_id is not null and seller_signed_document_id is not null and reviewed_by is not null and reviewed_at is not null)
  )
);

create table public.offer_wet_ink_execution_events (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offer_wet_ink_execution_records(offer_id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('pack_prepared', 'buyer_evidence_received', 'seller_evidence_received', 'execution_approved', 'execution_rejected')),
  note text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index offer_wet_ink_execution_records_queue_idx on public.offer_wet_ink_execution_records (organisation_id, status, updated_at desc);
create index offer_wet_ink_execution_events_offer_idx on public.offer_wet_ink_execution_events (offer_id, created_at desc);

alter table public.offer_wet_ink_execution_records enable row level security;
alter table public.offer_wet_ink_execution_events enable row level security;
revoke all on table public.offer_wet_ink_execution_records, public.offer_wet_ink_execution_events from public, anon, authenticated;
grant all on table public.offer_wet_ink_execution_records, public.offer_wet_ink_execution_events to service_role;

create or replace function public.bridge_offer_wet_ink_reviewer_authorized(p_organisation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.bridge_membership_role(p_organisation_id) in (
    'principal', 'director', 'partner', 'admin', 'super_admin', 'manager', 'hq_manager', 'branch_manager'
  );
$$;

create or replace function public.bridge_offer_wet_ink_document_belongs_to_listing(p_document_id uuid, p_listing_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.private_listing_documents document
    where document.id = p_document_id and document.private_listing_id = p_listing_id
      and document.status in ('uploaded', 'under_review', 'approved', 'completed')
  );
$$;

create or replace function public.bridge_prepare_wet_ink_offer_execution(p_offer_id uuid, p_printable_pack_document_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_offer public.offers%rowtype; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if v_actor is null or v_offer.id is null or not public.bridge_is_active_member(v_offer.organisation_id) then raise exception 'An active organisation member is required.' using errcode = '42501'; end if;
  if coalesce(v_offer.offer_amount, 0) <= 0 then raise exception 'Capture the commercial offer amount before preparing a wet-ink OTP pack.' using errcode = '22023'; end if;
  if v_offer.listing_id is null or not public.bridge_offer_wet_ink_document_belongs_to_listing(p_printable_pack_document_id, v_offer.listing_id) then raise exception 'Attach a printable OTP pack to this offer listing before preparation.' using errcode = '22023'; end if;
  if v_note is null or char_length(v_note) < 10 then raise exception 'Record the printable-pack source and version.' using errcode = '22023'; end if;
  insert into public.offer_wet_ink_execution_records (offer_id, organisation_id, listing_id, status, printable_pack_document_id, prepared_by, prepared_at, review_note)
  values (v_offer.id, v_offer.organisation_id, v_offer.listing_id, 'awaiting_buyer_wet_ink', p_printable_pack_document_id, v_actor, now(), v_note)
  on conflict (offer_id) do update set status = 'awaiting_buyer_wet_ink', printable_pack_document_id = excluded.printable_pack_document_id, buyer_signed_document_id = null, seller_signed_document_id = null, prepared_by = excluded.prepared_by, prepared_at = excluded.prepared_at, review_note = excluded.review_note, reviewed_by = null, reviewed_at = null, updated_at = now();
  insert into public.offer_wet_ink_execution_events (offer_id, organisation_id, actor_id, event_type, note, metadata) values (v_offer.id, v_offer.organisation_id, v_actor, 'pack_prepared', v_note, jsonb_build_object('printablePackDocumentId', p_printable_pack_document_id));
  return jsonb_build_object('offerId', v_offer.id, 'status', 'awaiting_buyer_wet_ink');
end; $$;

create or replace function public.bridge_record_wet_ink_offer_evidence(p_offer_id uuid, p_signer_role text, p_document_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_role text := lower(trim(coalesce(p_signer_role, ''))); v_offer public.offers%rowtype; v_record public.offer_wet_ink_execution_records%rowtype;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  select * into v_record from public.offer_wet_ink_execution_records where offer_id = p_offer_id for update;
  if v_actor is null or v_offer.id is null or not public.bridge_is_active_member(v_offer.organisation_id) then raise exception 'An active organisation member is required.' using errcode = '42501'; end if;
  if v_record.offer_id is null or v_record.status = 'not_prepared' then raise exception 'Prepare and attach the printable OTP pack before recording signed evidence.' using errcode = '22023'; end if;
  if v_role not in ('buyer', 'seller') or not public.bridge_offer_wet_ink_document_belongs_to_listing(p_document_id, v_offer.listing_id) then raise exception 'Valid buyer or seller wet-ink evidence attached to this listing is required.' using errcode = '22023'; end if;
  if v_role = 'buyer' and v_record.status <> 'awaiting_buyer_wet_ink' then raise exception 'Buyer wet-ink evidence is not expected at this execution stage.' using errcode = '22023'; end if;
  if v_role = 'seller' and v_record.status <> 'awaiting_seller_wet_ink' then raise exception 'Buyer wet-ink evidence must be received before seller wet-ink evidence.' using errcode = '22023'; end if;
  if v_role = 'buyer' then update public.offer_wet_ink_execution_records set buyer_signed_document_id = p_document_id, status = 'awaiting_seller_wet_ink', updated_at = now() where offer_id = v_offer.id;
  else update public.offer_wet_ink_execution_records set seller_signed_document_id = p_document_id, status = 'awaiting_review', updated_at = now() where offer_id = v_offer.id; end if;
  insert into public.offer_wet_ink_execution_events (offer_id, organisation_id, actor_id, event_type, note, metadata) values (v_offer.id, v_offer.organisation_id, v_actor, case when v_role = 'buyer' then 'buyer_evidence_received' else 'seller_evidence_received' end, nullif(btrim(coalesce(p_note, '')), ''), jsonb_build_object('documentId', p_document_id));
  return jsonb_build_object('offerId', v_offer.id, 'status', case when v_role = 'buyer' then 'awaiting_seller_wet_ink' else 'awaiting_review' end);
end; $$;

create or replace function public.bridge_review_wet_ink_offer_execution(p_offer_id uuid, p_decision text, p_review_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_decision text := lower(trim(coalesce(p_decision, ''))); v_note text := nullif(btrim(coalesce(p_review_note, '')), ''); v_record public.offer_wet_ink_execution_records%rowtype;
begin
  select * into v_record from public.offer_wet_ink_execution_records where offer_id = p_offer_id for update;
  if v_record.offer_id is null or not public.bridge_offer_wet_ink_reviewer_authorized(v_record.organisation_id) then raise exception 'Wet-ink execution review requires an authorised organisation reviewer.' using errcode = '42501'; end if;
  if v_decision not in ('approve', 'reject') or v_note is null or char_length(v_note) < 20 then raise exception 'Record an approve/reject decision and a review note of at least 20 characters.' using errcode = '22023'; end if;
  if v_record.status <> 'awaiting_review' then raise exception 'Wet-ink execution evidence must be awaiting review before an execution decision.' using errcode = '22023'; end if;
  if v_decision = 'approve' and (v_record.status <> 'awaiting_review' or v_record.buyer_signed_document_id is null or v_record.seller_signed_document_id is null) then raise exception 'Both buyer and seller wet-ink evidence must be received before approval.' using errcode = '22023'; end if;
  update public.offer_wet_ink_execution_records set status = case when v_decision = 'approve' then 'fully_executed' else 'rejected' end, reviewed_by = v_actor, reviewed_at = now(), review_note = v_note, updated_at = now() where offer_id = p_offer_id;
  insert into public.offer_wet_ink_execution_events (offer_id, organisation_id, actor_id, event_type, note) values (v_record.offer_id, v_record.organisation_id, v_actor, case when v_decision = 'approve' then 'execution_approved' else 'execution_rejected' end, v_note);
  return jsonb_build_object('offerId', v_record.offer_id, 'status', case when v_decision = 'approve' then 'fully_executed' else 'rejected' end);
end; $$;

create or replace function public.bridge_list_wet_ink_offer_execution_records(p_organisation_id uuid, p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.bridge_is_active_member(p_organisation_id) then raise exception 'An active organisation member is required.' using errcode = '42501'; end if;
  return jsonb_build_object('records', coalesce((select jsonb_agg(jsonb_build_object(
    'offerId', record.offer_id, 'status', record.status, 'printablePackDocumentId', record.printable_pack_document_id,
    'buyerSignedDocumentId', record.buyer_signed_document_id, 'sellerSignedDocumentId', record.seller_signed_document_id,
    'preparedAt', record.prepared_at, 'reviewedAt', record.reviewed_at, 'reviewNote', record.review_note
  ) order by record.updated_at desc) from public.offer_wet_ink_execution_records record where record.organisation_id = p_organisation_id and record.listing_id = p_listing_id), '[]'::jsonb));
end; $$;

revoke all on function public.bridge_offer_wet_ink_reviewer_authorized(uuid), public.bridge_offer_wet_ink_document_belongs_to_listing(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bridge_prepare_wet_ink_offer_execution(uuid, uuid, text), public.bridge_record_wet_ink_offer_evidence(uuid, text, uuid, text), public.bridge_review_wet_ink_offer_execution(uuid, text, text), public.bridge_list_wet_ink_offer_execution_records(uuid, uuid) from public, anon;
grant execute on function public.bridge_prepare_wet_ink_offer_execution(uuid, uuid, text), public.bridge_record_wet_ink_offer_evidence(uuid, text, uuid, text), public.bridge_review_wet_ink_offer_execution(uuid, text, text), public.bridge_list_wet_ink_offer_execution_records(uuid, uuid) to authenticated;
