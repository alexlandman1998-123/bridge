begin;

create extension if not exists "pgcrypto";

create or replace function public.bridge_can_manage_matter_financials(
  target_transaction_id uuid,
  target_attorney_firm_id uuid default null,
  target_attorney_assignment_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null
    and (
      public.bridge_transaction_scope_is_internal_user()
      or (
        target_attorney_firm_id is not null
        and public.attorney_user_is_firm_lead(target_attorney_firm_id)
      )
      or exists (
        select 1
        from public.transaction_attorney_assignments assignment
        where assignment.transaction_id = target_transaction_id
          and coalesce(assignment.status, 'active') <> 'removed'
          and (
            target_attorney_assignment_id is null
            or assignment.id = target_attorney_assignment_id
          )
          and (
            assignment.primary_attorney_id = auth.uid()
            or assignment.secretary_id = auth.uid()
            or assignment.admin_handler_id = auth.uid()
          )
      )
    ),
    false
  );
$$;

create or replace function public.bridge_can_view_matter_financial_account(
  target_transaction_id uuid,
  target_party_role text,
  target_party_email text default null,
  target_participant_id uuid default null,
  target_attorney_firm_id uuid default null,
  target_attorney_assignment_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.bridge_can_manage_matter_financials(
      target_transaction_id,
      target_attorney_firm_id,
      target_attorney_assignment_id
    )
    or exists (
      select 1
      from public.transaction_participants participant
      where participant.transaction_id = target_transaction_id
        and coalesce(participant.status, 'active') <> 'removed'
        and (
          target_participant_id is null
          or participant.id = target_participant_id
        )
        and (
          participant.user_id = auth.uid()
          or lower(coalesce(participant.participant_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          or (
            target_party_email is not null
            and lower(coalesce(participant.participant_email, '')) = lower(target_party_email)
            and lower(coalesce(auth.jwt() ->> 'email', '')) = lower(target_party_email)
          )
        )
        and (
          lower(coalesce(participant.role_type, '')) = lower(target_party_role)
          or (
            lower(target_party_role) = 'buyer'
            and lower(coalesce(participant.role_type, '')) in ('buyer', 'client', 'purchaser')
          )
          or (
            lower(target_party_role) = 'seller'
            and lower(coalesce(participant.role_type, '')) in ('seller', 'vendor')
          )
        )
    ),
    false
  );
$$;

create table if not exists public.matter_financial_accounts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  attorney_firm_id uuid references public.attorney_firms(id) on delete set null,
  attorney_assignment_id uuid references public.transaction_attorney_assignments(id) on delete set null,
  participant_id uuid references public.transaction_participants(id) on delete set null,
  party_role text not null,
  party_ref text not null default 'primary',
  party_label text,
  party_email text,
  party_phone text,
  currency_code text not null default 'ZAR',
  status text not null default 'active',
  opening_balance numeric(14, 2) not null default 0,
  portal_enabled boolean not null default false,
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matter_financial_accounts_party_role_check check (
    party_role in ('buyer', 'seller', 'client', 'shared', 'internal')
  ),
  constraint matter_financial_accounts_currency_code_check check (
    currency_code ~ '^[A-Z]{3}$'
  ),
  constraint matter_financial_accounts_status_check check (
    status in ('active', 'closed', 'archived')
  ),
  constraint matter_financial_accounts_party_ref_check check (
    length(trim(party_ref)) > 0
  ),
  constraint matter_financial_accounts_id_transaction_unique unique (id, transaction_id),
  constraint matter_financial_accounts_transaction_party_ref_unique
    unique (transaction_id, party_role, party_ref)
);

create table if not exists public.matter_financial_documents (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  attorney_firm_id uuid references public.attorney_firms(id) on delete set null,
  source_document_id uuid references public.documents(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  supersedes_document_id uuid references public.matter_financial_documents(id) on delete set null,
  document_type text not null,
  document_status text not null default 'draft',
  audience_role text not null default 'internal',
  external_reference text,
  title text not null,
  storage_bucket text,
  storage_path text,
  file_name text,
  mime_type text,
  file_size_bytes bigint,
  file_sha256 text,
  currency_code text not null default 'ZAR',
  amount_total numeric(14, 2),
  amount_due numeric(14, 2),
  issued_on date,
  due_on date,
  uploaded_at timestamptz not null default now(),
  published_at timestamptz,
  voided_at timestamptz,
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matter_financial_documents_type_check check (
    document_type in (
      'invoice',
      'statement',
      'receipt',
      'proof_of_payment',
      'credit_note',
      'debit_note',
      'other'
    )
  ),
  constraint matter_financial_documents_status_check check (
    document_status in ('draft', 'published', 'superseded', 'void', 'deleted')
  ),
  constraint matter_financial_documents_audience_check check (
    audience_role in ('buyer', 'seller', 'client', 'shared', 'internal')
  ),
  constraint matter_financial_documents_currency_code_check check (
    currency_code ~ '^[A-Z]{3}$'
  ),
  constraint matter_financial_documents_file_size_check check (
    file_size_bytes is null or file_size_bytes >= 0
  ),
  constraint matter_financial_documents_publish_check check (
    (document_status = 'published' and published_at is not null)
    or (document_status <> 'published')
  ),
  constraint matter_financial_documents_account_transaction_fk
    foreign key (financial_account_id, transaction_id)
    references public.matter_financial_accounts(id, transaction_id)
    on delete cascade
  )
);

create table if not exists public.matter_financial_entries (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  financial_document_id uuid references public.matter_financial_documents(id) on delete set null,
  evidence_document_id uuid references public.documents(id) on delete set null,
  reversal_of_entry_id uuid references public.matter_financial_entries(id) on delete set null,
  entry_type text not null,
  entry_status text not null default 'draft',
  entry_visibility text not null default 'internal',
  amount numeric(14, 2) not null,
  currency_code text not null default 'ZAR',
  description text not null,
  occurred_on date not null default current_date,
  posted_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  source_type text,
  source_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matter_financial_entries_type_check check (
    entry_type in (
      'opening_balance',
      'charge',
      'payment',
      'credit',
      'debit',
      'adjustment',
      'write_off'
    )
  ),
  constraint matter_financial_entries_status_check check (
    entry_status in ('draft', 'posted', 'reversed', 'void')
  ),
  constraint matter_financial_entries_visibility_check check (
    entry_visibility in ('internal', 'client_visible')
  ),
  constraint matter_financial_entries_currency_code_check check (
    currency_code ~ '^[A-Z]{3}$'
  ),
  constraint matter_financial_entries_amount_check check (
    amount <> 0
    and (
      entry_type not in ('payment', 'credit', 'write_off')
      or amount < 0
    )
  ),
  constraint matter_financial_entries_posted_check check (
    (entry_status = 'posted' and posted_at is not null)
    or entry_status <> 'posted'
  ),
  constraint matter_financial_entries_account_transaction_fk
    foreign key (financial_account_id, transaction_id)
    references public.matter_financial_accounts(id, transaction_id)
    on delete cascade
);

create table if not exists public.matter_financial_account_events (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  event_type text not null,
  event_visibility text not null default 'internal',
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint matter_financial_account_events_visibility_check check (
    event_visibility in ('internal', 'client_visible')
  ),
  constraint matter_financial_account_events_type_check check (
    length(trim(event_type)) > 0
  ),
  constraint matter_financial_account_events_account_transaction_fk
    foreign key (financial_account_id, transaction_id)
    references public.matter_financial_accounts(id, transaction_id)
    on delete cascade
  )
);

create index if not exists matter_financial_accounts_transaction_idx
  on public.matter_financial_accounts (transaction_id, party_role, status);

create index if not exists matter_financial_accounts_firm_idx
  on public.matter_financial_accounts (attorney_firm_id, status, updated_at desc);

create index if not exists matter_financial_accounts_participant_idx
  on public.matter_financial_accounts (participant_id)
  where participant_id is not null;

create index if not exists matter_financial_documents_account_idx
  on public.matter_financial_documents (financial_account_id, document_type, document_status, issued_on desc);

create index if not exists matter_financial_documents_transaction_idx
  on public.matter_financial_documents (transaction_id, audience_role, document_status, created_at desc);

create index if not exists matter_financial_documents_source_document_idx
  on public.matter_financial_documents (source_document_id)
  where source_document_id is not null;

create unique index if not exists matter_financial_documents_active_replacement_idx
  on public.matter_financial_documents (supersedes_document_id)
  where supersedes_document_id is not null
    and document_status in ('draft', 'published');

create index if not exists matter_financial_entries_account_idx
  on public.matter_financial_entries (financial_account_id, entry_status, occurred_on desc, created_at desc);

create index if not exists matter_financial_entries_transaction_idx
  on public.matter_financial_entries (transaction_id, entry_status, occurred_on desc);

create index if not exists matter_financial_entries_document_idx
  on public.matter_financial_entries (financial_document_id)
  where financial_document_id is not null;

create index if not exists matter_financial_account_events_account_idx
  on public.matter_financial_account_events (financial_account_id, created_at desc);

create index if not exists matter_financial_account_events_transaction_idx
  on public.matter_financial_account_events (transaction_id, created_at desc);

drop trigger if exists matter_financial_accounts_set_updated_at on public.matter_financial_accounts;
create trigger matter_financial_accounts_set_updated_at
before update on public.matter_financial_accounts
for each row
execute function public.bridge_set_updated_at();

drop trigger if exists matter_financial_documents_set_updated_at on public.matter_financial_documents;
create trigger matter_financial_documents_set_updated_at
before update on public.matter_financial_documents
for each row
execute function public.bridge_set_updated_at();

drop trigger if exists matter_financial_entries_set_updated_at on public.matter_financial_entries;
create trigger matter_financial_entries_set_updated_at
before update on public.matter_financial_entries
for each row
execute function public.bridge_set_updated_at();

create or replace view public.matter_financial_account_balances
with (security_invoker = true)
as
select
  account.id as financial_account_id,
  account.transaction_id,
  account.attorney_firm_id,
  account.attorney_assignment_id,
  account.participant_id,
  account.party_role,
  account.party_ref,
  account.party_label,
  account.party_email,
  account.currency_code,
  account.status,
  account.portal_enabled,
  account.opening_balance,
  coalesce(sum(entry.amount) filter (where entry.entry_status = 'posted'), 0)::numeric(14, 2) as posted_entry_total,
  (
    account.opening_balance
    + coalesce(sum(entry.amount) filter (where entry.entry_status = 'posted'), 0)
  )::numeric(14, 2) as balance_due,
  coalesce(sum(entry.amount) filter (
    where entry.entry_status = 'posted'
      and entry.entry_type in ('opening_balance', 'charge', 'debit')
      and entry.amount > 0
  ), 0)::numeric(14, 2) as total_charged,
  abs(coalesce(sum(entry.amount) filter (
    where entry.entry_status = 'posted'
      and entry.entry_type in ('payment', 'credit', 'write_off')
      and entry.amount < 0
  ), 0))::numeric(14, 2) as total_credited,
  max(entry.posted_at) as last_posted_at
from public.matter_financial_accounts account
left join public.matter_financial_entries entry
  on entry.financial_account_id = account.id
group by account.id;

alter table if exists public.matter_financial_accounts enable row level security;
alter table if exists public.matter_financial_documents enable row level security;
alter table if exists public.matter_financial_entries enable row level security;
alter table if exists public.matter_financial_account_events enable row level security;

drop policy if exists matter_financial_accounts_select_scoped on public.matter_financial_accounts;
create policy matter_financial_accounts_select_scoped
  on public.matter_financial_accounts
  for select
  to authenticated
  using (
    public.bridge_can_view_matter_financial_account(
      transaction_id,
      party_role,
      party_email,
      participant_id,
      attorney_firm_id,
      attorney_assignment_id
    )
  );

drop policy if exists matter_financial_accounts_insert_scoped on public.matter_financial_accounts;
create policy matter_financial_accounts_insert_scoped
  on public.matter_financial_accounts
  for insert
  to authenticated
  with check (
    public.bridge_can_manage_matter_financials(
      transaction_id,
      attorney_firm_id,
      attorney_assignment_id
    )
  );

drop policy if exists matter_financial_accounts_update_scoped on public.matter_financial_accounts;
create policy matter_financial_accounts_update_scoped
  on public.matter_financial_accounts
  for update
  to authenticated
  using (
    public.bridge_can_manage_matter_financials(
      transaction_id,
      attorney_firm_id,
      attorney_assignment_id
    )
  )
  with check (
    public.bridge_can_manage_matter_financials(
      transaction_id,
      attorney_firm_id,
      attorney_assignment_id
    )
  );

drop policy if exists matter_financial_documents_select_scoped on public.matter_financial_documents;
create policy matter_financial_documents_select_scoped
  on public.matter_financial_documents
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.matter_financial_accounts account
      where account.id = matter_financial_documents.financial_account_id
        and public.bridge_can_manage_matter_financials(
          account.transaction_id,
          account.attorney_firm_id,
          account.attorney_assignment_id
        )
    )
    or (
      document_status = 'published'
      and audience_role <> 'internal'
      and exists (
        select 1
        from public.matter_financial_accounts account
        where account.id = matter_financial_documents.financial_account_id
          and public.bridge_can_view_matter_financial_account(
            account.transaction_id,
            account.party_role,
            account.party_email,
            account.participant_id,
            account.attorney_firm_id,
            account.attorney_assignment_id
          )
          and (
            matter_financial_documents.audience_role = account.party_role
            or matter_financial_documents.audience_role in ('client', 'shared')
          )
      )
    )
  );

drop policy if exists matter_financial_documents_insert_scoped on public.matter_financial_documents;
create policy matter_financial_documents_insert_scoped
  on public.matter_financial_documents
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.matter_financial_accounts account
      where account.id = matter_financial_documents.financial_account_id
        and public.bridge_can_manage_matter_financials(
          account.transaction_id,
          account.attorney_firm_id,
          account.attorney_assignment_id
        )
    )
  );

drop policy if exists matter_financial_documents_update_scoped on public.matter_financial_documents;
create policy matter_financial_documents_update_scoped
  on public.matter_financial_documents
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.matter_financial_accounts account
      where account.id = matter_financial_documents.financial_account_id
        and public.bridge_can_manage_matter_financials(
          account.transaction_id,
          account.attorney_firm_id,
          account.attorney_assignment_id
        )
    )
  )
  with check (
    exists (
      select 1
      from public.matter_financial_accounts account
      where account.id = matter_financial_documents.financial_account_id
        and public.bridge_can_manage_matter_financials(
          account.transaction_id,
          account.attorney_firm_id,
          account.attorney_assignment_id
        )
    )
  );

drop policy if exists matter_financial_entries_select_scoped on public.matter_financial_entries;
create policy matter_financial_entries_select_scoped
  on public.matter_financial_entries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.matter_financial_accounts account
      where account.id = matter_financial_entries.financial_account_id
        and public.bridge_can_manage_matter_financials(
          account.transaction_id,
          account.attorney_firm_id,
          account.attorney_assignment_id
        )
    )
    or (
      entry_status = 'posted'
      and entry_visibility = 'client_visible'
      and exists (
        select 1
        from public.matter_financial_accounts account
        where account.id = matter_financial_entries.financial_account_id
          and public.bridge_can_view_matter_financial_account(
            account.transaction_id,
            account.party_role,
            account.party_email,
            account.participant_id,
            account.attorney_firm_id,
            account.attorney_assignment_id
          )
      )
    )
  );

drop policy if exists matter_financial_entries_insert_scoped on public.matter_financial_entries;
create policy matter_financial_entries_insert_scoped
  on public.matter_financial_entries
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.matter_financial_accounts account
      where account.id = matter_financial_entries.financial_account_id
        and public.bridge_can_manage_matter_financials(
          account.transaction_id,
          account.attorney_firm_id,
          account.attorney_assignment_id
        )
    )
  );

drop policy if exists matter_financial_entries_update_scoped on public.matter_financial_entries;
create policy matter_financial_entries_update_scoped
  on public.matter_financial_entries
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.matter_financial_accounts account
      where account.id = matter_financial_entries.financial_account_id
        and public.bridge_can_manage_matter_financials(
          account.transaction_id,
          account.attorney_firm_id,
          account.attorney_assignment_id
        )
    )
  )
  with check (
    exists (
      select 1
      from public.matter_financial_accounts account
      where account.id = matter_financial_entries.financial_account_id
        and public.bridge_can_manage_matter_financials(
          account.transaction_id,
          account.attorney_firm_id,
          account.attorney_assignment_id
        )
    )
  );

drop policy if exists matter_financial_account_events_select_scoped on public.matter_financial_account_events;
create policy matter_financial_account_events_select_scoped
  on public.matter_financial_account_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.matter_financial_accounts account
      where account.id = matter_financial_account_events.financial_account_id
        and public.bridge_can_manage_matter_financials(
          account.transaction_id,
          account.attorney_firm_id,
          account.attorney_assignment_id
        )
    )
    or (
      event_visibility = 'client_visible'
      and exists (
        select 1
        from public.matter_financial_accounts account
        where account.id = matter_financial_account_events.financial_account_id
          and public.bridge_can_view_matter_financial_account(
            account.transaction_id,
            account.party_role,
            account.party_email,
            account.participant_id,
            account.attorney_firm_id,
            account.attorney_assignment_id
          )
      )
    )
  );

drop policy if exists matter_financial_account_events_insert_scoped on public.matter_financial_account_events;
create policy matter_financial_account_events_insert_scoped
  on public.matter_financial_account_events
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.matter_financial_accounts account
      where account.id = matter_financial_account_events.financial_account_id
        and public.bridge_can_manage_matter_financials(
          account.transaction_id,
          account.attorney_firm_id,
          account.attorney_assignment_id
        )
    )
  );

grant execute on function public.bridge_can_manage_matter_financials(uuid, uuid, uuid) to authenticated;
grant execute on function public.bridge_can_view_matter_financial_account(uuid, text, text, uuid, uuid, uuid) to authenticated;

grant select, insert, update on public.matter_financial_accounts to authenticated;
grant select, insert, update on public.matter_financial_documents to authenticated;
grant select, insert, update on public.matter_financial_entries to authenticated;
grant select, insert on public.matter_financial_account_events to authenticated;
grant select on public.matter_financial_account_balances to authenticated;

comment on table public.matter_financial_accounts is
  'Canonical attorney matter accounting account per transaction party. Buyer/seller rows are the secure surface for portal account details.';
comment on table public.matter_financial_documents is
  'Externally generated financial documents uploaded against a matter account, with draft/publish/supersede lifecycle.';
comment on table public.matter_financial_entries is
  'Operational matter account ledger entries. This is not a statutory trust accounting ledger.';
comment on table public.matter_financial_account_events is
  'Audit and activity events for attorney matter financial accounts.';
comment on view public.matter_financial_account_balances is
  'Derived account balance view for posted operational entries. Security is inherited from matter_financial_accounts and matter_financial_entries.';

notify pgrst, 'reload schema';

commit;
