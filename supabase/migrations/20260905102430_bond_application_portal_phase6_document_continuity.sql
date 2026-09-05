begin;

alter table public.bond_application_document_requirements
  add column if not exists linked_document_id uuid references public.documents(id) on delete set null,
  add column if not exists linked_at timestamptz,
  add column if not exists linked_by uuid references public.profiles(id) on delete set null,
  add column if not exists continuity_version text not null default 'bond_application_portal_phase6';

create index if not exists bond_application_document_requirements_linked_document_idx
  on public.bond_application_document_requirements (linked_document_id)
  where linked_document_id is not null;

create table if not exists public.bond_application_document_continuity_events (
  id uuid primary key default gen_random_uuid(),
  bond_application_id uuid not null references public.bond_applications(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  bond_application_document_requirement_id uuid not null references public.bond_application_document_requirements(id) on delete cascade,
  transaction_required_document_id uuid references public.transaction_required_documents(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  event_type text not null check (event_type in ('linked', 'unlinked')),
  source text not null default 'transaction_required_document_sync',
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists bond_application_document_continuity_events_requirement_idx
  on public.bond_application_document_continuity_events (bond_application_document_requirement_id, occurred_at desc);
create index if not exists bond_application_document_continuity_events_transaction_idx
  on public.bond_application_document_continuity_events (transaction_id, occurred_at desc);

alter table public.bond_application_document_continuity_events enable row level security;
revoke all on public.bond_application_document_continuity_events from public, anon, authenticated;
grant all on public.bond_application_document_continuity_events to service_role;

create or replace function public.bridge_sync_bond_application_document_continuity_phase6()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requirement public.bond_application_document_requirements%rowtype;
  v_document_id uuid := new.uploaded_document_id;
  v_event_type text;
begin
  if new.transaction_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.uploaded_document_id is not distinct from new.uploaded_document_id
    and old.is_uploaded is not distinct from new.is_uploaded then
    if coalesce(current_setting('bridge.phase6_force_sync', true), '') <> 'true' then
      return new;
    end if;
  end if;

  for v_requirement in
    select requirement.*
    from public.bond_application_document_requirements requirement
    join public.bond_applications application on application.id = requirement.bond_application_id
    where application.transaction_id = new.transaction_id
      and application.status <> 'cancelled'
      and requirement.status not in ('inactive', 'superseded', 'waived')
      and (
        requirement.transaction_required_document_id = new.id
        or (
          requirement.transaction_required_document_id is null
          and lower(coalesce(requirement.requirement_key, '')) = lower(coalesce(new.document_key, ''))
        )
      )
  loop
    v_event_type := case when coalesce(new.is_uploaded, false) and v_document_id is not null then 'linked' else 'unlinked' end;
    if v_requirement.linked_document_id is not distinct from case when v_event_type = 'linked' then v_document_id else null end
      and ((v_event_type = 'linked' and v_requirement.status = 'satisfied') or (v_event_type = 'unlinked' and v_requirement.status = 'active')) then
      continue;
    end if;
    update public.bond_application_document_requirements
    set linked_document_id = case when v_event_type = 'linked' then v_document_id else null end,
        linked_at = case when v_event_type = 'linked' then now() else null end,
        linked_by = case when v_event_type = 'linked' then auth.uid() else null end,
        status = case when v_event_type = 'linked' then 'satisfied' else 'active' end,
        continuity_version = 'bond_application_portal_phase6',
        updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'continuitySource', 'transaction_required_document_sync',
          'continuitySyncedAt', now(),
          'transactionRequiredDocumentId', new.id
        )
    where id = v_requirement.id;

    insert into public.bond_application_document_continuity_events (
      bond_application_id, transaction_id, bond_application_document_requirement_id,
      transaction_required_document_id, document_id, event_type, metadata
    ) values (
      v_requirement.bond_application_id, new.transaction_id, v_requirement.id,
      new.id, case when v_event_type = 'linked' then v_document_id else null end, v_event_type,
      jsonb_build_object('documentKey', new.document_key, 'requiredDocumentStatus', new.status)
    );

    if v_event_type = 'linked' then
      update public.transaction_bond_originator_document_requests request
      set linked_document_id = v_document_id,
          uploaded_at = coalesce(request.uploaded_at, now()),
          submitted_for_review_at = coalesce(request.submitted_for_review_at, now()),
          status = case when request.status in ('sent', 'viewed', 'in_progress', 'needs_more_information', 'rejected') then 'awaiting_review' else request.status end,
          updated_at = now(),
          metadata = coalesce(request.metadata, '{}'::jsonb) || jsonb_build_object(
            'continuityLinkedAt', now(),
            'continuityRequirementId', v_requirement.id,
            'continuitySource', 'transaction_required_document_sync'
          )
      where request.transaction_id = new.transaction_id
        and request.bond_application_id = v_requirement.bond_application_id
        and request.status not in ('accepted', 'withdrawn', 'cancelled')
        and (
          request.transaction_required_document_id = new.id
          or lower(coalesce(request.requirement_key, '')) = lower(coalesce(v_requirement.requirement_key, ''))
          or lower(coalesce(request.canonical_document_type, '')) = lower(coalesce(v_requirement.canonical_document_type, ''))
        );
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.bridge_reconcile_bond_application_document_continuity_phase6(
  p_bond_application_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected integer := 0;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role is required.' using errcode = '42501';
  end if;
  perform set_config('bridge.phase6_force_sync', 'true', true);
  update public.transaction_required_documents required_document
  set updated_at = required_document.updated_at
  where required_document.is_uploaded = true
    and required_document.uploaded_document_id is not null
    and exists (
      select 1
      from public.bond_application_document_requirements requirement
      join public.bond_applications application on application.id = requirement.bond_application_id
      where application.transaction_id = required_document.transaction_id
        and application.status <> 'cancelled'
        and (p_bond_application_id is null or application.id = p_bond_application_id)
        and (
          requirement.transaction_required_document_id = required_document.id
          or (requirement.transaction_required_document_id is null and lower(coalesce(requirement.requirement_key, '')) = lower(coalesce(required_document.document_key, '')))
        )
    );
  get diagnostics v_affected = row_count;
  return jsonb_build_object('affectedTransactionRequirements', v_affected, 'bondApplicationId', p_bond_application_id, 'reconciledAt', now());
end;
$$;

drop trigger if exists trg_sync_bond_application_document_continuity_phase6 on public.transaction_required_documents;
create trigger trg_sync_bond_application_document_continuity_phase6
  after insert or update of uploaded_document_id, is_uploaded on public.transaction_required_documents
  for each row execute function public.bridge_sync_bond_application_document_continuity_phase6();

create or replace function public.bridge_bond_application_portal_document_continuity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_link public.bond_application_portal_access_links%rowtype;
begin
  select * into v_link from public.bridge_bond_application_portal_active_link();
  if v_link.id is null then
    raise exception 'Bond application access link is invalid, expired, or revoked.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'version', 'bond_application_portal_phase6',
    'summary', (
      select jsonb_build_object(
        'total', count(*)::integer,
        'linked', count(*) filter (where requirement.linked_document_id is not null)::integer,
        'outstanding', count(*) filter (where requirement.status = 'active')::integer,
        'lastSyncedAt', max(requirement.linked_at)
      )
      from public.bond_application_document_requirements requirement
      where requirement.bond_application_id = v_link.bond_application_id
        and requirement.status not in ('inactive', 'superseded')
    ),
    'requirements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', requirement.id,
        'requirementKey', requirement.requirement_key,
        'canonicalDocumentType', requirement.canonical_document_type,
        'status', requirement.status,
        'documentAvailable', requirement.linked_document_id is not null,
        'linkedAt', requirement.linked_at
      ) order by requirement.created_at asc)
      from public.bond_application_document_requirements requirement
      where requirement.bond_application_id = v_link.bond_application_id
        and requirement.status not in ('inactive', 'superseded')
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.bridge_bond_application_portal_originator_document_continuity_view()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('version', 'bond_application_portal_phase6', 'items', coalesce(jsonb_agg(
    jsonb_build_object(
      'exportPackageId', package.id,
      'bondApplicationId', package.bond_application_id,
      'summary', coalesce(summary.value, jsonb_build_object('total', 0, 'linked', 0, 'outstanding', 0, 'awaitingReview', 0))
    ) order by package.created_at desc
  ), '[]'::jsonb))
  from public.transaction_bond_originator_workspace_assignments assignment
  join public.transaction_bond_application_export_packages package on package.id = assignment.export_package_id
  left join lateral (
    select jsonb_build_object(
      'total', count(*)::integer,
      'linked', count(*) filter (where requirement.linked_document_id is not null)::integer,
      'outstanding', count(*) filter (where requirement.status = 'active')::integer,
      'awaitingReview', count(*) filter (where request.status = 'awaiting_review')::integer
    ) as value
    from public.bond_application_document_requirements requirement
    left join public.transaction_bond_originator_document_requests request
      on request.bond_application_id = requirement.bond_application_id
      and (request.requirement_key = requirement.requirement_key or request.canonical_document_type = requirement.canonical_document_type)
    where requirement.bond_application_id = package.bond_application_id
      and requirement.status not in ('inactive', 'superseded')
  ) summary on true
  where assignment.assigned_to_profile_id = auth.uid()
    and assignment.status in ('assigned', 'accepted')
    and package.destination_key = 'bond_originator_intake'
    and package.status not in ('cancelled', 'superseded');
$$;

revoke all on function public.bridge_bond_application_portal_document_continuity() from public;
revoke all on function public.bridge_bond_application_portal_originator_document_continuity_view() from public, anon;
revoke all on function public.bridge_reconcile_bond_application_document_continuity_phase6(uuid) from public, anon, authenticated;
grant execute on function public.bridge_bond_application_portal_document_continuity() to anon, authenticated;
grant execute on function public.bridge_bond_application_portal_originator_document_continuity_view() to authenticated;
grant execute on function public.bridge_reconcile_bond_application_document_continuity_phase6(uuid) to service_role;

comment on table public.bond_application_document_continuity_events is
  'Phase 6 audit ledger. It records canonical links between transaction-required documents and bond application requirements; no file is copied.';
comment on function public.bridge_bond_application_portal_document_continuity() is
  'Token-scoped Phase 6 document continuity projection. It exposes document state only, never document storage coordinates or signed URLs.';
comment on function public.bridge_reconcile_bond_application_document_continuity_phase6(uuid) is
  'Service-only Phase 6 backfill command for documents uploaded before the continuity trigger was installed.';

notify pgrst, 'reload schema';
commit;
