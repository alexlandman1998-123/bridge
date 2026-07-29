create table if not exists public.transaction_bond_originator_buyer_offer_decisions (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid not null references public.transaction_bond_application_export_packages(id) on delete cascade,
  offer_capture_id uuid not null references public.transaction_bond_originator_bank_offer_captures(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  bond_application_id uuid references public.bond_applications(id) on delete set null,
  submission_id uuid references public.transaction_bond_application_submissions(id) on delete set null,
  participant_id uuid references public.bond_application_participants(id) on delete set null,
  linked_bond_quote_id uuid references public.transaction_bond_quotes(id) on delete set null,
  decision text not null,
  decision_at timestamptz not null default now(),
  signed_offer_document_id uuid references public.documents(id) on delete set null,
  decision_proposal_json jsonb not null default '{}'::jsonb,
  idempotency_key text,
  creates_bank_application boolean not null default false,
  workflow_mutation_required boolean not null default false,
  bank_workflow_unchanged boolean not null default true,
  offer_workflow_unchanged boolean not null default true,
  grant_workflow_unchanged boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint transaction_bond_originator_buyer_offer_decisions_decision_check check (
    decision in ('accepted', 'declined')
  ),
  constraint transaction_bond_originator_buyer_offer_decisions_no_auto_workflow_check check (
    creates_bank_application = false
    and workflow_mutation_required = false
    and bank_workflow_unchanged = true
    and offer_workflow_unchanged = true
    and grant_workflow_unchanged = true
  )
);

create table if not exists public.transaction_bond_originator_buyer_grant_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid not null references public.transaction_bond_application_export_packages(id) on delete cascade,
  grant_capture_id uuid not null references public.transaction_bond_originator_grant_captures(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  bond_application_id uuid references public.bond_applications(id) on delete set null,
  submission_id uuid references public.transaction_bond_application_submissions(id) on delete set null,
  participant_id uuid references public.bond_application_participants(id) on delete set null,
  linked_bond_quote_id uuid references public.transaction_bond_quotes(id) on delete set null,
  status text not null,
  acknowledged_at timestamptz not null default now(),
  signed_grant_document_id uuid references public.documents(id) on delete set null,
  grant_milestone_proposal_json jsonb not null default '{}'::jsonb,
  idempotency_key text,
  creates_bank_application boolean not null default false,
  workflow_mutation_required boolean not null default false,
  bank_workflow_unchanged boolean not null default true,
  offer_workflow_unchanged boolean not null default true,
  grant_workflow_unchanged boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint transaction_bond_originator_buyer_grant_acknowledgements_status_check check (
    status in ('acknowledged', 'signed')
  ),
  constraint transaction_bond_originator_buyer_grant_acknowledgements_no_auto_workflow_check check (
    creates_bank_application = false
    and workflow_mutation_required = false
    and bank_workflow_unchanged = true
    and offer_workflow_unchanged = true
    and grant_workflow_unchanged = true
  )
);

create unique index if not exists transaction_bond_originator_buyer_offer_decisions_idempotency_idx
  on public.transaction_bond_originator_buyer_offer_decisions (offer_capture_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists transaction_bond_originator_buyer_offer_decisions_transaction_idx
  on public.transaction_bond_originator_buyer_offer_decisions (transaction_id, decision_at desc);

create unique index if not exists transaction_bond_originator_buyer_grant_acknowledgements_idempotency_idx
  on public.transaction_bond_originator_buyer_grant_acknowledgements (grant_capture_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists transaction_bond_originator_buyer_grant_acknowledgements_transaction_idx
  on public.transaction_bond_originator_buyer_grant_acknowledgements (transaction_id, acknowledged_at desc);

alter table public.transaction_bond_originator_buyer_offer_decisions enable row level security;
alter table public.transaction_bond_originator_buyer_grant_acknowledgements enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_buyer_offer_decisions'
      and policyname = 'Service role manages buyer originator offer decisions'
  ) then
    create policy "Service role manages buyer originator offer decisions"
      on public.transaction_bond_originator_buyer_offer_decisions
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_buyer_grant_acknowledgements'
      and policyname = 'Service role manages buyer originator grant acknowledgements'
  ) then
    create policy "Service role manages buyer originator grant acknowledgements"
      on public.transaction_bond_originator_buyer_grant_acknowledgements
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

drop trigger if exists trg_touch_bond_originator_buyer_offer_decision on public.transaction_bond_originator_buyer_offer_decisions;
create trigger trg_touch_bond_originator_buyer_offer_decision
  before update on public.transaction_bond_originator_buyer_offer_decisions
  for each row execute function public.bridge_touch_bond_originator_offer_grant_capture();

drop trigger if exists trg_touch_bond_originator_buyer_grant_acknowledgement on public.transaction_bond_originator_buyer_grant_acknowledgements;
create trigger trg_touch_bond_originator_buyer_grant_acknowledgement
  before update on public.transaction_bond_originator_buyer_grant_acknowledgements
  for each row execute function public.bridge_touch_bond_originator_offer_grant_capture();

comment on table public.transaction_bond_originator_buyer_offer_decisions is
  'Phase 8E buyer decision evidence for originator-captured bank offers. Records buyer intent and a governed proposal only; it does not create bank applications or mutate offer workflow automatically.';
comment on table public.transaction_bond_originator_buyer_grant_acknowledgements is
  'Phase 8E buyer acknowledgement or signed-document evidence for originator-captured grants. It does not create bank applications, mutate grant workflow automatically, or advance finance stages.';

create or replace function public.bridge_client_portal_bond_originator_offer_grant_package()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text := public.bridge_client_portal_request_token();
  v_link public.client_portal_links%rowtype;
  v_package public.transaction_bond_application_export_packages%rowtype;
  v_offers jsonb := '[]'::jsonb;
  v_grants jsonb := '[]'::jsonb;
begin
  if coalesce(v_token, '') = '' then
    return null;
  end if;

  select *
  into v_link
  from public.client_portal_links link
  where link.token = v_token
    and link.is_active = true
  order by link.updated_at desc nulls last, link.created_at desc nulls last
  limit 1;

  if not found then
    raise exception 'Client portal link is invalid or inactive.';
  end if;

  select *
  into v_package
  from public.transaction_bond_application_export_packages package
  where package.transaction_id = v_link.transaction_id
    and package.destination_key = 'bond_originator_intake'
    and package.status not in ('cancelled', 'superseded')
  order by package.package_ready_at desc nulls last, package.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', offer.id,
        'export_package_id', offer.export_package_id,
        'transaction_id', offer.transaction_id,
        'bond_application_id', offer.bond_application_id,
        'submission_id', offer.submission_id,
        'bank_name', offer.bank_name,
        'offered_amount', offer.offered_amount,
        'interest_rate', offer.interest_rate,
        'interest_rate_type', offer.interest_rate_type,
        'interest_rate_display', offer.interest_rate_display,
        'monthly_repayment', offer.monthly_repayment,
        'term_months', offer.term_months,
        'valid_until', offer.valid_until,
        'quote_document_id', offer.quote_document_id,
        'conditions_summary', offer.conditions_summary,
        'status', offer.status,
        'buyer_decision', offer.buyer_decision,
        'buyer_decision_at', offer.buyer_decision_at,
        'linked_bond_quote_id', offer.linked_bond_quote_id,
        'captured_at', offer.captured_at,
        'published_at', offer.published_at
      )
      order by offer.published_at desc nulls last, offer.captured_at desc
    ),
    '[]'::jsonb
  )
  into v_offers
  from public.transaction_bond_originator_bank_offer_captures offer
  where offer.export_package_id = v_package.id
    and offer.transaction_id = v_link.transaction_id
    and offer.status in ('published_to_buyer', 'accepted_by_buyer', 'declined_by_buyer');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', grant_capture.id,
        'export_package_id', grant_capture.export_package_id,
        'transaction_id', grant_capture.transaction_id,
        'bond_application_id', grant_capture.bond_application_id,
        'submission_id', grant_capture.submission_id,
        'offer_capture_id', grant_capture.offer_capture_id,
        'linked_bond_quote_id', grant_capture.linked_bond_quote_id,
        'bank_name', grant_capture.bank_name,
        'approved_amount', grant_capture.approved_amount,
        'grant_document_id', grant_capture.grant_document_id,
        'signed_grant_document_id', grant_capture.signed_grant_document_id,
        'grant_reference', grant_capture.grant_reference,
        'conditions_summary', grant_capture.conditions_summary,
        'status', grant_capture.status,
        'captured_at', grant_capture.captured_at,
        'published_at', grant_capture.published_at
      )
      order by grant_capture.published_at desc nulls last, grant_capture.captured_at desc
    ),
    '[]'::jsonb
  )
  into v_grants
  from public.transaction_bond_originator_grant_captures grant_capture
  where grant_capture.export_package_id = v_package.id
    and grant_capture.transaction_id = v_link.transaction_id
    and grant_capture.status in ('published_to_buyer', 'buyer_signed', 'submitted_for_instruction');

  return jsonb_build_object(
    'id', v_package.id,
    'transaction_id', v_package.transaction_id,
    'bond_application_id', v_package.bond_application_id,
    'submission_id', v_package.submission_id,
    'destination_key', v_package.destination_key,
    'destination_type', v_package.destination_type,
    'status', v_package.status,
    'originator_recipient_name', v_package.originator_recipient_name,
    'package_ready_at', v_package.package_ready_at,
    'accepted_at', v_package.accepted_at,
    'last_downloaded_at', v_package.last_downloaded_at,
    'offerCaptures', v_offers,
    'grantCaptures', v_grants,
    'bankWorkflowUnchanged', true,
    'offerWorkflowMutationDeferred', true,
    'grantWorkflowMutationDeferred', true
  );
end;
$$;

revoke all on function public.bridge_client_portal_bond_originator_offer_grant_package() from public;
grant execute on function public.bridge_client_portal_bond_originator_offer_grant_package() to anon, authenticated;

comment on function public.bridge_client_portal_bond_originator_offer_grant_package() is
  'Phase 8E client-portal read model for buyer-visible originator-captured offers and grants. Returns sanitized fields only and never exposes export payload JSON, internal notes, tokens or bank workflow mutation controls.';
