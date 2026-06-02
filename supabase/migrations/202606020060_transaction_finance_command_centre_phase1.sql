begin;

create extension if not exists "pgcrypto";

alter table if exists public.transaction_finance_workflows
  add column if not exists finance_owner text,
  add column if not exists blocker_status text,
  add column if not exists next_action text;

alter table if exists public.transaction_bond_applications
  add column if not exists bond_originator_id uuid references public.profiles(id) on delete set null,
  add column if not exists originator_organisation_id uuid,
  add column if not exists application_reference text,
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null;

alter table if exists public.transaction_bond_applications
  drop constraint if exists transaction_bond_applications_status_check;

alter table if exists public.transaction_bond_applications
  add constraint transaction_bond_applications_status_check check (
    status in (
      'draft',
      'pending',
      'submitted',
      'in_review',
      'feedback_received',
      'quote_received',
      'additional_documents_required',
      'approved',
      'buyer_approved',
      'declined',
      'withdrawn',
      'expired'
    )
  );

alter table if exists public.transaction_bond_quotes
  add column if not exists interest_rate_type text,
  add column if not exists interest_rate_margin numeric,
  add column if not exists interest_rate_display text,
  add column if not exists monthly_repayment numeric,
  add column if not exists valid_until date,
  add column if not exists quote_document_id uuid references public.documents(id) on delete set null,
  add column if not exists uploaded_by uuid references public.profiles(id) on delete set null;

alter table if exists public.transaction_bond_quotes
  drop constraint if exists transaction_bond_quotes_status_check;

alter table if exists public.transaction_bond_quotes
  add constraint transaction_bond_quotes_status_check check (
    quote_status in (
      'received',
      'accepted',
      'declined',
      'expired',
      'withdrawn',
      'not_selected',
      'approved_by_buyer',
      'declined_by_buyer'
    )
  );

drop index if exists public.transaction_bond_quotes_one_approved_per_workflow_idx;
create unique index if not exists transaction_bond_quotes_one_approved_per_workflow_idx
  on public.transaction_bond_quotes (workflow_id)
  where quote_status in ('accepted', 'approved_by_buyer');

create table if not exists public.transaction_bond_offer_decisions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  bond_offer_id uuid not null references public.transaction_bond_quotes(id) on delete cascade,
  decision text not null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_by_role text,
  decision_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_bond_offer_decisions_decision_check check (
    decision in ('accepted', 'declined')
  )
);

create unique index if not exists transaction_bond_offer_decisions_one_accepted_idx
  on public.transaction_bond_offer_decisions (transaction_id)
  where decision = 'accepted';

create index if not exists transaction_bond_offer_decisions_offer_idx
  on public.transaction_bond_offer_decisions (bond_offer_id, decision_at desc);

create table if not exists public.transaction_bond_instructions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  accepted_bond_offer_id uuid references public.transaction_bond_quotes(id) on delete set null,
  instruction_sent boolean not null default false,
  instruction_sent_at timestamptz,
  instruction_sent_by uuid references public.profiles(id) on delete set null,
  instruction_document_id uuid references public.documents(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists transaction_bond_instructions_transaction_idx
  on public.transaction_bond_instructions (transaction_id);

alter table if exists public.documents
  add column if not exists finance_lane text,
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id uuid;

create index if not exists documents_finance_lane_idx
  on public.documents (transaction_id, finance_lane, created_at desc);

create index if not exists documents_related_entity_idx
  on public.documents (related_entity_type, related_entity_id);

alter table if exists public.transaction_bond_offer_decisions enable row level security;
alter table if exists public.transaction_bond_instructions enable row level security;

drop policy if exists transaction_bond_applications_select on public.transaction_bond_applications;
create policy transaction_bond_applications_select
  on public.transaction_bond_applications
  for select
  to anon, authenticated
  using (
    public.bridge_transaction_scope_is_internal_user()
    or public.bridge_has_request_transaction_token_access(transaction_id)
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = transaction_bond_applications.transaction_id
        and tp.status <> 'removed'
        and (
          tp.user_id = auth.uid()
          or lower(coalesce(tp.participant_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

drop policy if exists transaction_bond_quotes_select on public.transaction_bond_quotes;
create policy transaction_bond_quotes_select
  on public.transaction_bond_quotes
  for select
  to anon, authenticated
  using (
    public.bridge_transaction_scope_is_internal_user()
    or public.bridge_has_request_transaction_token_access(transaction_id)
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = transaction_bond_quotes.transaction_id
        and tp.status <> 'removed'
        and (
          tp.user_id = auth.uid()
          or lower(coalesce(tp.participant_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

drop policy if exists transaction_finance_workflow_events_select on public.transaction_finance_workflow_events;
create policy transaction_finance_workflow_events_select
  on public.transaction_finance_workflow_events
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.transaction_finance_workflows tfw
      where tfw.id = transaction_finance_workflow_events.workflow_id
        and (
          public.bridge_transaction_scope_is_internal_user()
          or public.bridge_has_request_transaction_token_access(tfw.transaction_id)
          or exists (
            select 1
            from public.transaction_participants tp
            where tp.transaction_id = tfw.transaction_id
              and tp.status <> 'removed'
              and (
                tp.user_id = auth.uid()
                or lower(coalesce(tp.participant_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
              )
          )
        )
    )
  );

drop policy if exists transaction_finance_workflows_token_select on public.transaction_finance_workflows;
create policy transaction_finance_workflows_token_select
  on public.transaction_finance_workflows
  for select
  to anon, authenticated
  using (public.bridge_has_request_transaction_token_access(transaction_id));

drop policy if exists transaction_bond_offer_decisions_select on public.transaction_bond_offer_decisions;
create policy transaction_bond_offer_decisions_select
  on public.transaction_bond_offer_decisions
  for select
  to anon, authenticated
  using (
    public.bridge_transaction_scope_is_internal_user()
    or public.bridge_has_request_transaction_token_access(transaction_id)
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = transaction_bond_offer_decisions.transaction_id
        and tp.status <> 'removed'
        and (
          tp.user_id = auth.uid()
          or lower(coalesce(tp.participant_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

drop policy if exists transaction_bond_offer_decisions_insert on public.transaction_bond_offer_decisions;
create policy transaction_bond_offer_decisions_insert
  on public.transaction_bond_offer_decisions
  for insert
  to anon, authenticated
  with check (
    public.bridge_has_client_portal_token_transaction_access(transaction_id)
    or public.bridge_transaction_scope_is_internal_user()
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = transaction_bond_offer_decisions.transaction_id
        and tp.status <> 'removed'
        and (
          tp.can_edit_finance_workflow = true
          or tp.role_type in ('buyer', 'client')
        )
        and (
          tp.user_id = auth.uid()
          or lower(coalesce(tp.participant_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

drop policy if exists transaction_bond_instructions_select on public.transaction_bond_instructions;
create policy transaction_bond_instructions_select
  on public.transaction_bond_instructions
  for select
  to anon, authenticated
  using (
    public.bridge_transaction_scope_is_internal_user()
    or public.bridge_has_request_transaction_token_access(transaction_id)
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = transaction_bond_instructions.transaction_id
        and tp.status <> 'removed'
        and (
          tp.user_id = auth.uid()
          or lower(coalesce(tp.participant_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

drop policy if exists transaction_bond_instructions_modify on public.transaction_bond_instructions;
create policy transaction_bond_instructions_modify
  on public.transaction_bond_instructions
  for all
  to authenticated
  using (
    public.bridge_transaction_scope_is_internal_user()
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = transaction_bond_instructions.transaction_id
        and tp.status <> 'removed'
        and tp.can_edit_finance_workflow = true
        and tp.user_id = auth.uid()
    )
  )
  with check (
    public.bridge_transaction_scope_is_internal_user()
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = transaction_bond_instructions.transaction_id
        and tp.status <> 'removed'
        and tp.can_edit_finance_workflow = true
        and tp.user_id = auth.uid()
    )
  );

create or replace function public.touch_transaction_bond_offer_decisions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_transaction_bond_offer_decisions_updated_at on public.transaction_bond_offer_decisions;
create trigger touch_transaction_bond_offer_decisions_updated_at
  before update on public.transaction_bond_offer_decisions
  for each row execute function public.touch_transaction_bond_offer_decisions_updated_at();

drop trigger if exists touch_transaction_bond_instructions_updated_at on public.transaction_bond_instructions;
create trigger touch_transaction_bond_instructions_updated_at
  before update on public.transaction_bond_instructions
  for each row execute function public.touch_bond_hybrid_finance_workflow_updated_at();

notify pgrst, 'reload schema';

commit;
