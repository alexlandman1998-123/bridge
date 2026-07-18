begin;

alter table if exists public.private_listing_documents
  add column if not exists review_due_at timestamptz,
  add column if not exists review_sla_revision integer not null default 0,
  add column if not exists review_sla_level text not null default 'none',
  add column if not exists review_sla_escalated_at timestamptz,
  add constraint private_listing_documents_review_sla_level_check
    check (review_sla_level in ('none','warning','breach','critical','resolved'));

create index if not exists private_listing_documents_review_sla_idx
  on public.private_listing_documents(status, review_due_at)
  where status in ('uploaded','under_review');

create or replace function public.bridge_prepare_seller_document_review_sla_p1_9()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'uploaded'
     and (tg_op = 'INSERT' or old.status is distinct from 'uploaded') then
    new.review_due_at := coalesce(new.uploaded_at, now()) + interval '48 hours';
    new.review_sla_revision := greatest(coalesce(new.review_sla_revision, 0) + 1, 1);
    new.review_sla_level := 'none';
    new.review_sla_escalated_at := null;
  elsif new.status = 'under_review' and new.review_due_at is null then
    new.review_due_at := coalesce(new.review_started_at, new.uploaded_at, now()) + interval '48 hours';
    new.review_sla_revision := greatest(coalesce(new.review_sla_revision, 0), 1);
  elsif new.status in ('approved','completed','rejected','not_applicable') then
    new.review_sla_level := 'resolved';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prepare_seller_document_review_sla_p1_9 on public.private_listing_documents;
create trigger trg_prepare_seller_document_review_sla_p1_9
before insert or update of status, review_due_at
on public.private_listing_documents
for each row execute function public.bridge_prepare_seller_document_review_sla_p1_9();

update public.private_listing_documents
set review_due_at = coalesce(uploaded_at, created_at, now()) + interval '48 hours',
    review_sla_revision = greatest(coalesce(review_sla_revision, 0), 1),
    review_sla_level = 'none'
where review_due_at is null and status in ('uploaded','under_review');

update public.private_listing_documents
set review_sla_level = 'resolved'
where status in ('approved','completed','rejected','not_applicable')
  and review_sla_level = 'none';

insert into public.notification_automation_definitions (
  automation_key, display_name, category, trigger_type, recipient_role, channels,
  implementation_status, default_enabled, dedupe_strategy, reminder_policy, metadata_json
) values
  ('seller_document_review_sla_warning', 'Seller document review due soon', 'notification', 'system_event', 'agent', array['in_app'], 'active', true, 'document_sla_revision_level', '{"thresholdHours":24}'::jsonb, '{"phase":"P1-9"}'::jsonb),
  ('seller_document_review_sla_breach', 'Seller document review SLA breached', 'notification', 'system_event', 'agent', array['in_app'], 'active', true, 'document_sla_revision_level', '{"thresholdHours":48}'::jsonb, '{"phase":"P1-9"}'::jsonb),
  ('seller_document_review_sla_critical', 'Seller document review critically overdue', 'notification', 'system_event', 'agency_admin', array['in_app'], 'active', true, 'document_sla_revision_level', '{"thresholdHours":96}'::jsonb, '{"phase":"P1-9"}'::jsonb)
on conflict (automation_key) do update set
  display_name = excluded.display_name,
  implementation_status = excluded.implementation_status,
  default_enabled = excluded.default_enabled,
  channels = excluded.channels,
  reminder_policy = excluded.reminder_policy,
  metadata_json = coalesce(public.notification_automation_definitions.metadata_json, '{}'::jsonb) || excluded.metadata_json,
  updated_at = now();

create or replace function public.bridge_refresh_seller_document_review_sla_p1_9(
  p_limit integer default 250,
  p_now timestamptz default now(),
  p_dry_run boolean default false,
  p_organisation_id uuid default null,
  p_listing_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_limit integer := greatest(1, least(coalesce(p_limit, 250), 1000));
  v_candidate_count integer := 0;
  v_queued_count integer := 0;
  v_warning_count integer := 0;
  v_breach_count integer := 0;
  v_critical_count integer := 0;
begin
  create temporary table if not exists seller_document_review_sla_candidates_p1_9 (
    document_id uuid,
    private_listing_id uuid,
    organisation_id uuid,
    assigned_user_id uuid,
    requirement_id uuid,
    requirement_key text,
    requirement_name text,
    document_name text,
    uploaded_at timestamptz,
    review_due_at timestamptz,
    review_age_hours numeric,
    sla_revision integer,
    sla_level text,
    owner_missing boolean,
    dedupe_key text
  ) on commit drop;
  truncate seller_document_review_sla_candidates_p1_9;

  insert into seller_document_review_sla_candidates_p1_9
  select
    document.id, listing.id, listing.organisation_id, listing.assigned_agent_id,
    requirement.id, requirement.requirement_key, requirement.requirement_name,
    document.document_name, document.uploaded_at, document.review_due_at,
    extract(epoch from (v_now - coalesce(document.uploaded_at, document.created_at))) / 3600.0,
    greatest(coalesce(document.review_sla_revision, 0), 1),
    case
      when listing.assigned_agent_id is null then 'critical'
      when v_now >= document.review_due_at + interval '48 hours' then 'critical'
      when v_now >= document.review_due_at then 'breach'
      else 'warning'
    end,
    listing.assigned_agent_id is null,
    'seller-document-review-sla:' || document.id::text || ':v' || greatest(coalesce(document.review_sla_revision, 0), 1)::text || ':' ||
      case when listing.assigned_agent_id is null then 'critical' when v_now >= document.review_due_at + interval '48 hours' then 'critical' when v_now >= document.review_due_at then 'breach' else 'warning' end
  from public.private_listing_documents document
  join public.private_listings listing on listing.id = document.private_listing_id
  left join public.private_listing_document_requirements requirement on requirement.id = document.requirement_id
  where document.status in ('uploaded','under_review')
    and document.review_due_at is not null
    and (listing.assigned_agent_id is null or v_now >= document.review_due_at - interval '24 hours')
    and (p_organisation_id is null or listing.organisation_id = p_organisation_id)
    and (p_listing_id is null or listing.id = p_listing_id)
    and not exists (
      select 1 from public.notification_events event
      where event.organisation_id = listing.organisation_id
        and event.dedupe_key = 'seller-document-review-sla:' || document.id::text || ':v' || greatest(coalesce(document.review_sla_revision, 0), 1)::text || ':' ||
          case when listing.assigned_agent_id is null then 'critical' when v_now >= document.review_due_at + interval '48 hours' then 'critical' when v_now >= document.review_due_at then 'breach' else 'warning' end
    )
  order by document.review_due_at asc, document.id
  limit v_limit;

  select count(*),
         count(*) filter (where sla_level = 'warning'),
         count(*) filter (where sla_level = 'breach'),
         count(*) filter (where sla_level = 'critical')
  into v_candidate_count, v_warning_count, v_breach_count, v_critical_count
  from seller_document_review_sla_candidates_p1_9;

  if not coalesce(p_dry_run, false) then
    insert into public.notification_events (
      automation_key, organisation_id, assigned_user_id, listing_id, event_key,
      category, trigger_type, channel, status, recipient_role, subject,
      message_preview, source, dedupe_key, payload_json, metadata_json,
      prepared_at, queued_at
    )
    select
      'seller_document_review_sla_' || candidate.sla_level,
      candidate.organisation_id, candidate.assigned_user_id, candidate.private_listing_id,
      'seller_document_review_sla_' || candidate.sla_level,
      'notification', 'system_event', 'in_app', 'queued',
      case when candidate.sla_level = 'critical' then 'agency_admin' else 'agent' end,
      case candidate.sla_level
        when 'warning' then 'Seller document review due within 24 hours'
        when 'breach' then 'Seller document review SLA breached'
        else case when candidate.owner_missing then 'Critical: seller document review has no owner' else 'Critical: seller document review exceeds 96 hours' end
      end,
      coalesce(candidate.requirement_name, candidate.document_name, 'Seller document') ||
        case when candidate.owner_missing then ' has no assigned review owner.' when candidate.sla_level = 'warning' then ' is approaching its review deadline.' when candidate.sla_level = 'breach' then ' is overdue for review.' else ' is critically overdue and needs management attention.' end,
      'seller_document_review_sla_p1_9', candidate.dedupe_key,
      jsonb_build_object(
        'documentId', candidate.document_id, 'requirementId', candidate.requirement_id,
        'requirementKey', candidate.requirement_key, 'reviewDueAt', candidate.review_due_at,
        'reviewAgeHours', round(candidate.review_age_hours, 1), 'slaRevision', candidate.sla_revision,
        'slaLevel', candidate.sla_level, 'ownerMissing', candidate.owner_missing
      ),
      jsonb_build_object('phase','P1-9','automatic',true), v_now, v_now
    from seller_document_review_sla_candidates_p1_9 candidate;
    get diagnostics v_queued_count = row_count;

    update public.private_listing_documents document
    set review_sla_level = candidate.sla_level,
        review_sla_escalated_at = v_now,
        updated_at = now()
    from seller_document_review_sla_candidates_p1_9 candidate
    where document.id = candidate.document_id
      and case document.review_sla_level when 'critical' then 3 when 'breach' then 2 when 'warning' then 1 else 0 end
          < case candidate.sla_level when 'critical' then 3 when 'breach' then 2 else 1 end;

    insert into public.private_listing_activity (
      private_listing_id, activity_type, activity_title, activity_description,
      performed_by, visibility, metadata
    )
    select
      candidate.private_listing_id, 'seller_document_review_sla_' || candidate.sla_level,
      coalesce(candidate.requirement_name, candidate.document_name, 'Seller document') || ' review ' ||
        case candidate.sla_level when 'warning' then 'due soon' when 'breach' then 'overdue' else 'critically overdue' end,
      'Automatic P1-9 review SLA monitor raised a ' || candidate.sla_level || ' alert.',
      null, 'internal',
      jsonb_build_object('documentId',candidate.document_id,'requirementId',candidate.requirement_id,'reviewDueAt',candidate.review_due_at,'slaLevel',candidate.sla_level,'dedupeKey',candidate.dedupe_key,'phase','P1-9')
    from seller_document_review_sla_candidates_p1_9 candidate
    where candidate.sla_level in ('breach','critical');
  end if;

  return jsonb_build_object(
    'success', true, 'phase', 'P1-9', 'dryRun', coalesce(p_dry_run, false),
    'candidateCount', v_candidate_count, 'queuedCount', v_queued_count,
    'warningCount', v_warning_count, 'breachCount', v_breach_count,
    'criticalCount', v_critical_count, 'generatedAt', v_now
  );
end;
$$;

create or replace function public.bridge_resolve_seller_document_review_sla_p1_9()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('approved','completed','rejected','not_applicable')
     and old.status is distinct from new.status then
    update public.notification_events event
    set status = 'skipped',
        metadata_json = coalesce(event.metadata_json, '{}'::jsonb) || jsonb_build_object(
          'resolvedAt', now(), 'resolvedByDocumentStatus', new.status, 'phase', 'P1-9'
        ),
        updated_at = now()
    where event.automation_key in (
        'seller_document_review_sla_warning',
        'seller_document_review_sla_breach',
        'seller_document_review_sla_critical'
      )
      and event.status in ('prepared','queued')
      and event.payload_json->>'documentId' = new.id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_resolve_seller_document_review_sla_p1_9 on public.private_listing_documents;
create trigger trg_resolve_seller_document_review_sla_p1_9
after update of status on public.private_listing_documents
for each row execute function public.bridge_resolve_seller_document_review_sla_p1_9();

create or replace view public.seller_document_review_sla_v1
with (security_invoker = true)
as
select
  document.id as document_id,
  document.private_listing_id,
  listing.organisation_id,
  listing.assigned_agent_id,
  document.requirement_id,
  requirement.requirement_key,
  requirement.requirement_name,
  document.document_name,
  document.status,
  document.uploaded_at,
  document.review_started_at,
  document.review_due_at,
  document.review_sla_revision,
  document.review_sla_level,
  document.review_sla_escalated_at,
  extract(epoch from (now() - coalesce(document.uploaded_at, document.created_at))) / 3600.0 as review_age_hours,
  extract(epoch from (document.review_due_at - now())) / 3600.0 as hours_until_due,
  case
    when listing.assigned_agent_id is null then 'unassigned'
    when document.status not in ('uploaded','under_review') then 'resolved'
    when now() >= document.review_due_at + interval '48 hours' then 'critical'
    when now() >= document.review_due_at then 'breached'
    when now() >= document.review_due_at - interval '24 hours' then 'due_soon'
    else 'on_track'
  end as sla_state,
  coalesce(alerts.failed_notification_count, 0) as failed_notification_count,
  alerts.last_alert_at
from public.private_listing_documents document
join public.private_listings listing on listing.id = document.private_listing_id
left join public.private_listing_document_requirements requirement on requirement.id = document.requirement_id
left join lateral (
  select
    count(*) filter (where event.status = 'failed')::integer as failed_notification_count,
    max(event.created_at) as last_alert_at
  from public.notification_events event
  where event.organisation_id = listing.organisation_id
    and event.payload_json->>'documentId' = document.id::text
    and event.automation_key in (
      'seller_document_review_sla_warning',
      'seller_document_review_sla_breach',
      'seller_document_review_sla_critical'
    )
) alerts on true;

grant select on public.seller_document_review_sla_v1 to authenticated;
grant execute on function public.bridge_refresh_seller_document_review_sla_p1_9(integer,timestamptz,boolean,uuid,uuid) to service_role;

commit;
