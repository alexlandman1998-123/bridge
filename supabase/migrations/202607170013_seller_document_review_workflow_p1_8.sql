begin;

alter table if exists public.private_listing_documents
  add column if not exists review_revision integer not null default 0,
  add column if not exists review_started_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists review_reason text,
  add column if not exists rejection_reason text;

create table if not exists public.seller_document_review_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  requirement_id uuid references public.private_listing_document_requirements(id) on delete set null,
  document_id uuid not null references public.private_listing_documents(id) on delete cascade,
  action text not null,
  previous_status text,
  next_status text not null,
  reason text,
  actor_id uuid references auth.users(id) on delete set null,
  review_revision integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint seller_document_review_events_action_check
    check (action in ('start_review','approve','reject','manual_reminder'))
);

create index if not exists seller_document_review_events_document_idx
  on public.seller_document_review_events(document_id, review_revision desc, created_at desc);
create index if not exists seller_document_review_events_listing_idx
  on public.seller_document_review_events(private_listing_id, created_at desc);

alter table public.seller_document_review_events enable row level security;
drop policy if exists seller_document_review_events_member_select on public.seller_document_review_events;
create policy seller_document_review_events_member_select
on public.seller_document_review_events for select to authenticated
using (public.bridge_is_active_member(organisation_id));
grant select on public.seller_document_review_events to authenticated;

insert into public.notification_automation_definitions (
  automation_key, display_name, category, trigger_type, recipient_role, channels,
  implementation_status, default_enabled, dedupe_strategy, reminder_policy, metadata_json
) values
  ('seller_document_review_outcome', 'Seller document review outcome', 'notification', 'system_event', 'seller', array['in_app','email'], 'active', true, 'document_revision_outcome', '{}'::jsonb, '{"phase":"P1-8"}'::jsonb),
  ('seller_document_manual_reminder', 'Seller document manual reminder', 'reminder', 'manual_send', 'seller', array['in_app','email'], 'active', true, 'requirement_revision_calendar_day', '{}'::jsonb, '{"phase":"P1-8"}'::jsonb)
on conflict (automation_key) do update set
  display_name = excluded.display_name,
  implementation_status = excluded.implementation_status,
  default_enabled = excluded.default_enabled,
  channels = excluded.channels,
  metadata_json = coalesce(public.notification_automation_definitions.metadata_json, '{}'::jsonb) || excluded.metadata_json,
  updated_at = now();

create or replace function public.bridge_review_private_listing_seller_document_p1_8(
  p_document_id uuid,
  p_action text,
  p_reason text default null,
  p_expected_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.private_listing_documents%rowtype;
  v_listing public.private_listings%rowtype;
  v_requirement public.private_listing_document_requirements%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_next_status text;
  v_revision integer;
  v_seller_email text;
  v_dedupe_key text;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if p_document_id is null then raise exception 'Document id is required.' using errcode = '22023'; end if;
  if v_action not in ('start_review','approve','reject') then raise exception 'Unsupported seller document review action.' using errcode = '22023'; end if;
  if v_action = 'reject' and char_length(coalesce(v_reason, '')) < 5 then
    raise exception 'A clear rejection reason of at least 5 characters is required.' using errcode = '22023';
  end if;

  select * into v_document from public.private_listing_documents where id = p_document_id for update;
  if not found then raise exception 'Seller document was not found.' using errcode = 'P0002'; end if;
  select * into v_listing from public.private_listings where id = v_document.private_listing_id;
  if not found then raise exception 'Private listing was not found.' using errcode = 'P0002'; end if;
  if not coalesce(public.bridge_is_org_admin(v_listing.organisation_id), false)
     and v_listing.assigned_agent_id is distinct from auth.uid()
     and v_listing.created_by is distinct from auth.uid()
  then raise exception 'You are not authorised to review this seller document.' using errcode = '42501'; end if;

  if v_document.requirement_id is null then
    raise exception 'The document must be linked to an exact seller requirement before review.' using errcode = '23514';
  end if;
  select * into v_requirement
  from public.private_listing_document_requirements
  where id = v_document.requirement_id and private_listing_id = v_document.private_listing_id
  for update;
  if not found then raise exception 'The linked seller requirement is missing or belongs to another listing.' using errcode = '23514'; end if;
  if v_requirement.is_required is false or v_requirement.status = 'not_applicable' then
    raise exception 'This seller requirement is no longer reviewable.' using errcode = '23514';
  end if;

  if p_expected_revision is not null and p_expected_revision <> coalesce(v_document.review_revision, 0) then
    raise exception 'This seller document was changed by another reviewer. Refresh before deciding.' using errcode = '40001';
  end if;

  v_next_status := case v_action when 'start_review' then 'under_review' when 'approve' then 'approved' else 'rejected' end;
  if v_document.status = v_next_status then
    return jsonb_build_object('ok', true, 'idempotent', true, 'document', to_jsonb(v_document), 'requirement', to_jsonb(v_requirement));
  end if;
  if v_document.status not in ('uploaded','under_review') then
    raise exception 'Only uploaded or under-review seller documents can be decided.' using errcode = '23514';
  end if;

  v_revision := coalesce(v_document.review_revision, 0) + 1;
  update public.private_listing_documents set
    status = v_next_status,
    review_revision = v_revision,
    review_started_at = case when v_action = 'start_review' then now() else coalesce(review_started_at, now()) end,
    reviewed_at = case when v_action in ('approve','reject') then now() else null end,
    reviewed_by = auth.uid(),
    review_reason = case when v_action = 'approve' then v_reason else null end,
    rejection_reason = case when v_action = 'reject' then v_reason else null end,
    updated_at = now()
  where id = v_document.id;

  insert into public.seller_document_review_events (
    organisation_id, private_listing_id, requirement_id, document_id, action,
    previous_status, next_status, reason, actor_id, review_revision, metadata
  ) values (
    v_listing.organisation_id, v_listing.id, v_requirement.id, v_document.id, v_action,
    v_document.status, v_next_status, v_reason, auth.uid(), v_revision,
    jsonb_build_object('phase','P1-8','requirementKey',v_requirement.requirement_key,'documentType',v_document.document_type)
  );

  insert into public.private_listing_activity (
    private_listing_id, activity_type, activity_title, activity_description,
    performed_by, visibility, metadata
  ) values (
    v_listing.id,
    'seller_document_' || v_action,
    coalesce(v_requirement.requirement_name, 'Seller document') || case v_action when 'approve' then ' approved' when 'reject' then ' needs correction' else ' under review' end,
    case v_action when 'approve' then 'Your document was reviewed and accepted.' when 'reject' then 'A corrected document is required: ' || v_reason else 'Your document is being reviewed.' end,
    auth.uid(),
    case when v_action in ('approve','reject') then 'client_visible' else 'internal' end,
    jsonb_build_object('documentId',v_document.id,'requirementId',v_requirement.id,'reviewRevision',v_revision,'action',v_action,'reason',v_reason,'phase','P1-8')
  );

  if v_action in ('approve','reject') then
    select lower(nullif(trim(coalesce(
      onboarding.form_data->>'sellerEmail', onboarding.form_data->>'email', portal.client_email
    )), '')) into v_seller_email
    from (select 1) seed
    left join lateral (
      select * from public.private_listing_seller_onboarding row_data
      where row_data.private_listing_id = v_listing.id order by row_data.updated_at desc nulls last limit 1
    ) onboarding on true
    left join lateral (
      select * from public.client_portal_contexts row_data
      where row_data.listing_id = v_listing.id and row_data.context_type = 'selling' and row_data.status = 'active'
      order by row_data.updated_at desc nulls last limit 1
    ) portal on true;
    v_dedupe_key := 'seller-document-review:' || v_document.id::text || ':v' || v_revision::text || ':' || v_action;
    insert into public.notification_events (
      automation_key, organisation_id, assigned_user_id, listing_id, event_key,
      category, trigger_type, channel, status, recipient_email, recipient_role,
      subject, message_preview, source, dedupe_key, payload_json, metadata_json,
      prepared_at, queued_at
    ) values (
      'seller_document_review_outcome', v_listing.organisation_id, v_listing.assigned_agent_id, v_listing.id,
      'seller_document_' || v_action, 'notification', 'system_event',
      case when v_seller_email is null then 'in_app' else 'email' end, 'queued', v_seller_email, 'seller',
      case when v_action = 'approve' then 'Document approved: ' else 'Action required: replace ' end || coalesce(v_requirement.requirement_name, 'seller document'),
      case when v_action = 'approve' then 'Your document was reviewed and accepted.' else 'Please upload a corrected document. ' || v_reason end,
      'seller_document_review_workflow_p1_8', v_dedupe_key,
      jsonb_build_object('documentId',v_document.id,'requirementId',v_requirement.id,'requirementKey',v_requirement.requirement_key,'reviewRevision',v_revision,'action',v_action,'reason',v_reason),
      jsonb_build_object('phase','P1-8'), now(), now()
    ) on conflict do nothing;
  end if;

  select * into v_document from public.private_listing_documents where id = p_document_id;
  select * into v_requirement from public.private_listing_document_requirements where id = v_document.requirement_id;
  return jsonb_build_object('ok', true, 'idempotent', false, 'document', to_jsonb(v_document), 'requirement', to_jsonb(v_requirement));
end;
$$;

create or replace function public.bridge_send_seller_document_manual_reminder_p1_8(
  p_requirement_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requirement public.private_listing_document_requirements%rowtype;
  v_listing public.private_listings%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_email text;
  v_dedupe_key text;
  v_event_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select * into v_requirement from public.private_listing_document_requirements where id = p_requirement_id for update;
  if not found then raise exception 'Seller document requirement was not found.' using errcode = 'P0002'; end if;
  select * into v_listing from public.private_listings where id = v_requirement.private_listing_id;
  if not coalesce(public.bridge_is_org_admin(v_listing.organisation_id), false)
     and v_listing.assigned_agent_id is distinct from auth.uid()
     and v_listing.created_by is distinct from auth.uid()
  then raise exception 'You are not authorised to remind this seller.' using errcode = '42501'; end if;
  if v_requirement.status not in ('required','requested','rejected') or v_requirement.is_required is false then
    raise exception 'A reminder can only be sent for an outstanding required seller document.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.private_listing_documents document
    where document.requirement_id = v_requirement.id and document.private_listing_id = v_listing.id
      and document.status in ('uploaded','under_review','approved','completed')
  ) then raise exception 'A seller upload already exists; review it instead of sending another reminder.' using errcode = '23514'; end if;

  v_dedupe_key := 'seller-document-manual-reminder:' || v_requirement.id::text || ':v' || greatest(coalesce(v_requirement.request_revision,1),1)::text || ':' || current_date::text;
  select id into v_event_id from public.notification_events
  where organisation_id = v_listing.organisation_id and dedupe_key = v_dedupe_key limit 1;
  if v_event_id is not null then return jsonb_build_object('ok', true, 'idempotent', true, 'notificationEventId', v_event_id, 'dedupeKey', v_dedupe_key); end if;

  select lower(nullif(trim(coalesce(onboarding.form_data->>'sellerEmail', onboarding.form_data->>'email', portal.client_email)), '')) into v_email
  from (select 1) seed
  left join lateral (
    select * from public.private_listing_seller_onboarding row_data
    where row_data.private_listing_id = v_listing.id order by row_data.updated_at desc nulls last limit 1
  ) onboarding on true
  left join lateral (
    select * from public.client_portal_contexts row_data
    where row_data.listing_id = v_listing.id and row_data.context_type = 'selling' and row_data.status = 'active'
    order by row_data.updated_at desc nulls last limit 1
  ) portal on true;

  insert into public.notification_events (
    automation_key, organisation_id, assigned_user_id, listing_id, event_key,
    category, trigger_type, channel, status, recipient_email, recipient_role,
    subject, message_preview, source, dedupe_key, payload_json, metadata_json,
    prepared_at, queued_at
  ) values (
    'seller_document_manual_reminder', v_listing.organisation_id, v_listing.assigned_agent_id, v_listing.id,
    'seller_document_manual_reminder', 'reminder', 'manual_send',
    case when v_email is null then 'in_app' else 'email' end, 'queued', v_email, 'seller',
    'Reminder: ' || coalesce(v_requirement.requirement_name, 'seller document') || ' required',
    coalesce(v_reason, 'Please upload the outstanding document in your secure seller portal.'),
    'seller_document_review_workflow_p1_8', v_dedupe_key,
    jsonb_build_object('requirementId',v_requirement.id,'requirementKey',v_requirement.requirement_key,'requestRevision',greatest(coalesce(v_requirement.request_revision,1),1),'reason',v_reason),
    jsonb_build_object('phase','P1-8','manual',true), now(), now()
  ) returning id into v_event_id;

  update public.private_listing_document_requirements set
    reminder_count = coalesce(reminder_count,0) + 1,
    last_reminder_at = now(),
    next_reminder_at = public.bridge_add_seller_request_business_days(current_date, 2)::timestamptz,
    last_request_reason = 'manual_agent_reminder',
    request_metadata = coalesce(request_metadata,'{}'::jsonb) || jsonb_build_object('lastManualReminderBy',auth.uid(),'lastManualReminderAt',now(),'phase','P1-8')
  where id = v_requirement.id;

  insert into public.private_listing_activity (
    private_listing_id, activity_type, activity_title, activity_description,
    performed_by, visibility, metadata
  ) values (
    v_listing.id, 'seller_document_manual_reminder',
    coalesce(v_requirement.requirement_name,'Seller document') || ' reminder sent',
    coalesce(v_reason,'The property team sent a reminder for an outstanding seller document.'),
    auth.uid(), 'internal',
    jsonb_build_object('requirementId',v_requirement.id,'notificationEventId',v_event_id,'dedupeKey',v_dedupe_key,'phase','P1-8')
  );

  return jsonb_build_object('ok', true, 'idempotent', false, 'notificationEventId', v_event_id, 'dedupeKey', v_dedupe_key);
end;
$$;

create or replace view public.seller_document_review_queue_v1
with (security_invoker = true)
as
select
  document.id as document_id,
  document.private_listing_id,
  listing.organisation_id,
  document.requirement_id,
  requirement.requirement_key,
  requirement.requirement_name,
  requirement.request_stage,
  document.document_name,
  document.status,
  document.review_revision,
  document.review_started_at,
  document.reviewed_at,
  document.reviewed_by,
  document.rejection_reason,
  document.uploaded_at,
  extract(epoch from (now() - document.uploaded_at)) / 3600.0 as review_age_hours,
  case
    when document.status in ('uploaded','under_review') and document.uploaded_at < now() - interval '48 hours' then 'overdue'
    when document.status in ('uploaded','under_review') then 'pending'
    when document.status = 'rejected' then 'seller_correction'
    when document.status in ('approved','completed') then 'complete'
    else 'not_reviewable'
  end as queue_state
from public.private_listing_documents document
join public.private_listings listing on listing.id = document.private_listing_id
left join public.private_listing_document_requirements requirement on requirement.id = document.requirement_id;

grant select on public.seller_document_review_queue_v1 to authenticated;
grant execute on function public.bridge_review_private_listing_seller_document_p1_8(uuid,text,text,integer) to authenticated;
grant execute on function public.bridge_send_seller_document_manual_reminder_p1_8(uuid,text) to authenticated;

commit;
