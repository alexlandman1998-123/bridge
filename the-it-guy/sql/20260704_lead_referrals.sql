begin;

create table if not exists public.lead_referrals (
  id uuid primary key default gen_random_uuid(),
  source_organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_lead_id uuid references public.leads(lead_id) on delete set null,
  source_lead_type text not null default 'buyer',
  source_agent_id uuid references public.profiles(id) on delete set null,
  source_agent_email text,
  source_agent_name text,
  target_organisation_id uuid references public.organisations(id) on delete set null,
  target_agent_id uuid references public.profiles(id) on delete set null,
  target_agent_email text not null,
  target_agent_name text,
  target_company_name text,
  recipient_scope text not null default 'external_invite',
  status text not null default 'sent',
  commission_split_percentage numeric(6, 3),
  commission_split_basis text not null default 'gross_commission',
  converted_transaction_id uuid references public.transactions(id) on delete set null,
  converted_deal_id uuid references public.crm_deals(id) on delete set null,
  converted_at timestamptz,
  gross_commission_amount numeric(14, 2),
  referral_commission_amount numeric(14, 2),
  commission_status text not null default 'not_applicable',
  commission_due_at timestamptz,
  commission_paid_at timestamptz,
  commission_payment_reference text,
  operational_priority text not null default 'normal',
  next_follow_up_at timestamptz,
  last_follow_up_at timestamptz,
  follow_up_status text not null default 'open',
  lost_reason text,
  lost_at timestamptz,
  agreement_status text not null default 'pending',
  agreement_text text,
  invite_token text,
  invite_expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_referrals_source_lead_type_check
    check (source_lead_type in ('buyer', 'seller')),
  constraint lead_referrals_recipient_scope_check
    check (recipient_scope in ('internal', 'external_arch9', 'external_invite')),
  constraint lead_referrals_status_check
    check (status in ('draft', 'sent', 'received', 'accepted', 'declined', 'contacted', 'working', 'converted', 'lost', 'commission_due', 'paid', 'cancelled')),
  constraint lead_referrals_agreement_status_check
    check (agreement_status in ('pending', 'sent', 'accepted', 'declined', 'superseded')),
  constraint lead_referrals_commission_split_percentage_check
    check (commission_split_percentage is null or commission_split_percentage between 0 and 100),
  constraint lead_referrals_commission_status_check
    check (commission_status in ('not_applicable', 'pending', 'due', 'paid', 'waived', 'disputed')),
  constraint lead_referrals_operational_priority_check
    check (operational_priority in ('low', 'normal', 'high', 'urgent')),
  constraint lead_referrals_follow_up_status_check
    check (follow_up_status in ('open', 'due', 'done', 'paused'))
);

alter table if exists public.lead_referrals add column if not exists source_organisation_id uuid references public.organisations(id) on delete cascade;
alter table if exists public.lead_referrals add column if not exists source_lead_id uuid references public.leads(lead_id) on delete set null;
alter table if exists public.lead_referrals add column if not exists source_lead_type text not null default 'buyer';
alter table if exists public.lead_referrals add column if not exists source_agent_id uuid references public.profiles(id) on delete set null;
alter table if exists public.lead_referrals add column if not exists source_agent_email text;
alter table if exists public.lead_referrals add column if not exists source_agent_name text;
alter table if exists public.lead_referrals add column if not exists target_organisation_id uuid references public.organisations(id) on delete set null;
alter table if exists public.lead_referrals add column if not exists target_agent_id uuid references public.profiles(id) on delete set null;
alter table if exists public.lead_referrals add column if not exists target_agent_email text;
alter table if exists public.lead_referrals add column if not exists target_agent_name text;
alter table if exists public.lead_referrals add column if not exists target_company_name text;
alter table if exists public.lead_referrals add column if not exists recipient_scope text not null default 'external_invite';
alter table if exists public.lead_referrals add column if not exists status text not null default 'sent';
alter table if exists public.lead_referrals add column if not exists commission_split_percentage numeric(6, 3);
alter table if exists public.lead_referrals add column if not exists commission_split_basis text not null default 'gross_commission';
alter table if exists public.lead_referrals add column if not exists converted_transaction_id uuid references public.transactions(id) on delete set null;
alter table if exists public.lead_referrals add column if not exists converted_deal_id uuid references public.crm_deals(id) on delete set null;
alter table if exists public.lead_referrals add column if not exists converted_at timestamptz;
alter table if exists public.lead_referrals add column if not exists gross_commission_amount numeric(14, 2);
alter table if exists public.lead_referrals add column if not exists referral_commission_amount numeric(14, 2);
alter table if exists public.lead_referrals add column if not exists commission_status text not null default 'not_applicable';
alter table if exists public.lead_referrals add column if not exists commission_due_at timestamptz;
alter table if exists public.lead_referrals add column if not exists commission_paid_at timestamptz;
alter table if exists public.lead_referrals add column if not exists commission_payment_reference text;
alter table if exists public.lead_referrals add column if not exists operational_priority text not null default 'normal';
alter table if exists public.lead_referrals add column if not exists next_follow_up_at timestamptz;
alter table if exists public.lead_referrals add column if not exists last_follow_up_at timestamptz;
alter table if exists public.lead_referrals add column if not exists follow_up_status text not null default 'open';
alter table if exists public.lead_referrals add column if not exists lost_reason text;
alter table if exists public.lead_referrals add column if not exists lost_at timestamptz;
alter table if exists public.lead_referrals add column if not exists agreement_status text not null default 'pending';
alter table if exists public.lead_referrals add column if not exists agreement_text text;
alter table if exists public.lead_referrals add column if not exists invite_token text;
alter table if exists public.lead_referrals add column if not exists invite_expires_at timestamptz;
alter table if exists public.lead_referrals add column if not exists notes text;
alter table if exists public.lead_referrals add column if not exists created_at timestamptz not null default now();
alter table if exists public.lead_referrals add column if not exists updated_at timestamptz not null default now();

alter table if exists public.lead_referrals drop constraint if exists lead_referrals_status_check;
alter table if exists public.lead_referrals
  add constraint lead_referrals_status_check
  check (status in ('draft', 'sent', 'received', 'accepted', 'declined', 'contacted', 'working', 'converted', 'lost', 'commission_due', 'paid', 'cancelled'));

alter table if exists public.lead_referrals drop constraint if exists lead_referrals_commission_status_check;
alter table if exists public.lead_referrals
  add constraint lead_referrals_commission_status_check
  check (commission_status in ('not_applicable', 'pending', 'due', 'paid', 'waived', 'disputed'));

alter table if exists public.lead_referrals drop constraint if exists lead_referrals_operational_priority_check;
alter table if exists public.lead_referrals
  add constraint lead_referrals_operational_priority_check
  check (operational_priority in ('low', 'normal', 'high', 'urgent'));

alter table if exists public.lead_referrals drop constraint if exists lead_referrals_follow_up_status_check;
alter table if exists public.lead_referrals
  add constraint lead_referrals_follow_up_status_check
  check (follow_up_status in ('open', 'due', 'done', 'paused'));

create unique index if not exists lead_referrals_invite_token_unique_idx
  on public.lead_referrals (invite_token)
  where invite_token is not null;

create index if not exists lead_referrals_source_org_idx
  on public.lead_referrals (source_organisation_id, created_at desc);

create index if not exists lead_referrals_target_org_idx
  on public.lead_referrals (target_organisation_id, created_at desc);

create index if not exists lead_referrals_source_lead_idx
  on public.lead_referrals (source_lead_id);

create index if not exists lead_referrals_target_email_idx
  on public.lead_referrals (lower(target_agent_email), status);

create index if not exists lead_referrals_converted_transaction_idx
  on public.lead_referrals (converted_transaction_id)
  where converted_transaction_id is not null;

create index if not exists lead_referrals_commission_status_idx
  on public.lead_referrals (source_organisation_id, commission_status, created_at desc);

create index if not exists lead_referrals_follow_up_idx
  on public.lead_referrals (source_organisation_id, next_follow_up_at, follow_up_status)
  where next_follow_up_at is not null;

create table if not exists public.referral_clients (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.lead_referrals(id) on delete cascade,
  source_organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_lead_id uuid references public.leads(lead_id) on delete set null,
  client_type text not null default 'buyer',
  client_name text not null,
  client_email text,
  client_phone text,
  client_context text,
  client_status text not null default 'referred',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_clients_client_type_check
    check (client_type in ('buyer', 'seller')),
  constraint referral_clients_client_status_check
    check (client_status in ('referred', 'accepted', 'contacted', 'working', 'converted', 'lost', 'archived'))
);

alter table if exists public.referral_clients add column if not exists referral_id uuid references public.lead_referrals(id) on delete cascade;
alter table if exists public.referral_clients add column if not exists source_organisation_id uuid references public.organisations(id) on delete cascade;
alter table if exists public.referral_clients add column if not exists source_lead_id uuid references public.leads(lead_id) on delete set null;
alter table if exists public.referral_clients add column if not exists client_type text not null default 'buyer';
alter table if exists public.referral_clients add column if not exists client_name text;
alter table if exists public.referral_clients add column if not exists client_email text;
alter table if exists public.referral_clients add column if not exists client_phone text;
alter table if exists public.referral_clients add column if not exists client_context text;
alter table if exists public.referral_clients add column if not exists client_status text not null default 'referred';
alter table if exists public.referral_clients add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists public.referral_clients add column if not exists created_at timestamptz not null default now();
alter table if exists public.referral_clients add column if not exists updated_at timestamptz not null default now();

create unique index if not exists referral_clients_referral_unique_idx
  on public.referral_clients (referral_id);

create index if not exists referral_clients_source_org_idx
  on public.referral_clients (source_organisation_id, created_at desc);

create index if not exists referral_clients_email_idx
  on public.referral_clients (lower(client_email))
  where client_email is not null;

create table if not exists public.referral_agreements (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.lead_referrals(id) on delete cascade,
  version integer not null default 1,
  status text not null default 'pending',
  commission_split_percentage numeric(6, 3),
  commission_split_basis text not null default 'gross_commission',
  agreement_text text not null,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  accepted_by_email text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_agreements_status_check
    check (status in ('pending', 'sent', 'accepted', 'declined', 'superseded')),
  constraint referral_agreements_commission_split_percentage_check
    check (commission_split_percentage is null or commission_split_percentage between 0 and 100)
);

alter table if exists public.referral_agreements add column if not exists referral_id uuid references public.lead_referrals(id) on delete cascade;
alter table if exists public.referral_agreements add column if not exists version integer not null default 1;
alter table if exists public.referral_agreements add column if not exists status text not null default 'pending';
alter table if exists public.referral_agreements add column if not exists commission_split_percentage numeric(6, 3);
alter table if exists public.referral_agreements add column if not exists commission_split_basis text not null default 'gross_commission';
alter table if exists public.referral_agreements add column if not exists agreement_text text;
alter table if exists public.referral_agreements add column if not exists sent_at timestamptz;
alter table if exists public.referral_agreements add column if not exists accepted_at timestamptz;
alter table if exists public.referral_agreements add column if not exists declined_at timestamptz;
alter table if exists public.referral_agreements add column if not exists accepted_by_email text;
alter table if exists public.referral_agreements add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table if exists public.referral_agreements add column if not exists created_at timestamptz not null default now();
alter table if exists public.referral_agreements add column if not exists updated_at timestamptz not null default now();

create unique index if not exists referral_agreements_referral_version_unique_idx
  on public.referral_agreements (referral_id, version);

create index if not exists referral_agreements_referral_status_idx
  on public.referral_agreements (referral_id, status);

create table if not exists public.referral_status_events (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.lead_referrals(id) on delete cascade,
  from_status text,
  to_status text not null,
  event_type text not null default 'status_change',
  event_note text,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.referral_status_events add column if not exists referral_id uuid references public.lead_referrals(id) on delete cascade;
alter table if exists public.referral_status_events add column if not exists from_status text;
alter table if exists public.referral_status_events add column if not exists to_status text;
alter table if exists public.referral_status_events add column if not exists event_type text not null default 'status_change';
alter table if exists public.referral_status_events add column if not exists event_note text;
alter table if exists public.referral_status_events add column if not exists actor_id uuid references public.profiles(id) on delete set null;
alter table if exists public.referral_status_events add column if not exists actor_email text;
alter table if exists public.referral_status_events add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists public.referral_status_events add column if not exists created_at timestamptz not null default now();

create index if not exists referral_status_events_referral_created_idx
  on public.referral_status_events (referral_id, created_at desc);

create table if not exists public.referral_invites (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.lead_referrals(id) on delete cascade,
  token text not null,
  email text not null,
  status text not null default 'pending',
  expires_at timestamptz,
  first_sent_at timestamptz,
  last_sent_at timestamptz,
  accepted_at timestamptz,
  accepted_by_user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_invites_status_check
    check (status in ('pending', 'sent', 'accepted', 'declined', 'expired', 'revoked'))
);

alter table if exists public.referral_invites add column if not exists referral_id uuid references public.lead_referrals(id) on delete cascade;
alter table if exists public.referral_invites add column if not exists token text;
alter table if exists public.referral_invites add column if not exists email text;
alter table if exists public.referral_invites add column if not exists status text not null default 'pending';
alter table if exists public.referral_invites add column if not exists expires_at timestamptz;
alter table if exists public.referral_invites add column if not exists first_sent_at timestamptz;
alter table if exists public.referral_invites add column if not exists last_sent_at timestamptz;
alter table if exists public.referral_invites add column if not exists accepted_at timestamptz;
alter table if exists public.referral_invites add column if not exists accepted_by_user_id uuid references public.profiles(id) on delete set null;
alter table if exists public.referral_invites add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists public.referral_invites add column if not exists created_at timestamptz not null default now();
alter table if exists public.referral_invites add column if not exists updated_at timestamptz not null default now();

create unique index if not exists referral_invites_referral_unique_idx
  on public.referral_invites (referral_id);

create unique index if not exists referral_invites_token_unique_idx
  on public.referral_invites (token);

create index if not exists referral_invites_email_status_idx
  on public.referral_invites (lower(email), status);

create table if not exists public.referral_commission_events (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.lead_referrals(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  deal_id uuid references public.crm_deals(id) on delete set null,
  event_type text not null default 'conversion_recorded',
  gross_commission_amount numeric(14, 2),
  referral_commission_amount numeric(14, 2),
  commission_split_percentage numeric(6, 3),
  commission_status text not null default 'pending',
  payment_reference text,
  event_note text,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint referral_commission_events_event_type_check
    check (event_type in ('conversion_recorded', 'commission_due', 'commission_paid', 'commission_waived', 'commission_disputed', 'commission_adjusted')),
  constraint referral_commission_events_status_check
    check (commission_status in ('not_applicable', 'pending', 'due', 'paid', 'waived', 'disputed')),
  constraint referral_commission_events_split_check
    check (commission_split_percentage is null or commission_split_percentage between 0 and 100)
);

alter table if exists public.referral_commission_events add column if not exists referral_id uuid references public.lead_referrals(id) on delete cascade;
alter table if exists public.referral_commission_events add column if not exists transaction_id uuid references public.transactions(id) on delete set null;
alter table if exists public.referral_commission_events add column if not exists deal_id uuid references public.crm_deals(id) on delete set null;
alter table if exists public.referral_commission_events add column if not exists event_type text not null default 'conversion_recorded';
alter table if exists public.referral_commission_events add column if not exists gross_commission_amount numeric(14, 2);
alter table if exists public.referral_commission_events add column if not exists referral_commission_amount numeric(14, 2);
alter table if exists public.referral_commission_events add column if not exists commission_split_percentage numeric(6, 3);
alter table if exists public.referral_commission_events add column if not exists commission_status text not null default 'pending';
alter table if exists public.referral_commission_events add column if not exists payment_reference text;
alter table if exists public.referral_commission_events add column if not exists event_note text;
alter table if exists public.referral_commission_events add column if not exists actor_id uuid references public.profiles(id) on delete set null;
alter table if exists public.referral_commission_events add column if not exists actor_email text;
alter table if exists public.referral_commission_events add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists public.referral_commission_events add column if not exists created_at timestamptz not null default now();

create index if not exists referral_commission_events_referral_created_idx
  on public.referral_commission_events (referral_id, created_at desc);

create index if not exists referral_commission_events_transaction_idx
  on public.referral_commission_events (transaction_id)
  where transaction_id is not null;

create index if not exists referral_commission_events_status_idx
  on public.referral_commission_events (commission_status, created_at desc);

alter table if exists public.lead_referrals enable row level security;
alter table if exists public.referral_clients enable row level security;
alter table if exists public.referral_agreements enable row level security;
alter table if exists public.referral_status_events enable row level security;
alter table if exists public.referral_invites enable row level security;
alter table if exists public.referral_commission_events enable row level security;

drop policy if exists lead_referrals_agency_select on public.lead_referrals;
create policy lead_referrals_agency_select on public.lead_referrals
for select to authenticated
using (
  public.bridge_is_active_member(source_organisation_id)
  or public.bridge_is_active_member(target_organisation_id)
  or source_agent_id = auth.uid()
  or target_agent_id = auth.uid()
  or lower(coalesce(source_agent_email, '')) = lower(public.bridge_current_email())
  or lower(coalesce(target_agent_email, '')) = lower(public.bridge_current_email())
);

drop policy if exists lead_referrals_agency_insert on public.lead_referrals;
create policy lead_referrals_agency_insert on public.lead_referrals
for insert to authenticated
with check (
  public.bridge_is_active_member(source_organisation_id)
);

drop policy if exists lead_referrals_agency_update on public.lead_referrals;
create policy lead_referrals_agency_update on public.lead_referrals
for update to authenticated
using (
  public.bridge_is_active_member(source_organisation_id)
  or public.bridge_is_active_member(target_organisation_id)
  or source_agent_id = auth.uid()
  or target_agent_id = auth.uid()
)
with check (
  public.bridge_is_active_member(source_organisation_id)
  or public.bridge_is_active_member(target_organisation_id)
  or source_agent_id = auth.uid()
  or target_agent_id = auth.uid()
);

drop policy if exists referral_clients_agency_select on public.referral_clients;
create policy referral_clients_agency_select on public.referral_clients
for select to authenticated
using (
  exists (
    select 1
    from public.lead_referrals r
    where r.id = referral_id
      and (
        public.bridge_is_active_member(r.source_organisation_id)
        or public.bridge_is_active_member(r.target_organisation_id)
        or r.source_agent_id = auth.uid()
        or r.target_agent_id = auth.uid()
        or lower(coalesce(r.source_agent_email, '')) = lower(public.bridge_current_email())
        or lower(coalesce(r.target_agent_email, '')) = lower(public.bridge_current_email())
      )
  )
);

drop policy if exists referral_clients_agency_write on public.referral_clients;
create policy referral_clients_agency_write on public.referral_clients
for all to authenticated
using (
  exists (
    select 1
    from public.lead_referrals r
    where r.id = referral_id
      and (
        public.bridge_is_active_member(r.source_organisation_id)
        or public.bridge_is_active_member(r.target_organisation_id)
        or r.source_agent_id = auth.uid()
        or r.target_agent_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.lead_referrals r
    where r.id = referral_id
      and (
        public.bridge_is_active_member(r.source_organisation_id)
        or public.bridge_is_active_member(r.target_organisation_id)
        or r.source_agent_id = auth.uid()
        or r.target_agent_id = auth.uid()
      )
  )
);

drop policy if exists referral_agreements_agency_select on public.referral_agreements;
create policy referral_agreements_agency_select on public.referral_agreements
for select to authenticated
using (
  exists (
    select 1
    from public.lead_referrals r
    where r.id = referral_id
      and (
        public.bridge_is_active_member(r.source_organisation_id)
        or public.bridge_is_active_member(r.target_organisation_id)
        or r.source_agent_id = auth.uid()
        or r.target_agent_id = auth.uid()
        or lower(coalesce(r.source_agent_email, '')) = lower(public.bridge_current_email())
        or lower(coalesce(r.target_agent_email, '')) = lower(public.bridge_current_email())
      )
  )
);

drop policy if exists referral_agreements_agency_write on public.referral_agreements;
create policy referral_agreements_agency_write on public.referral_agreements
for all to authenticated
using (
  exists (
    select 1
    from public.lead_referrals r
    where r.id = referral_id
      and (
        public.bridge_is_active_member(r.source_organisation_id)
        or public.bridge_is_active_member(r.target_organisation_id)
        or r.source_agent_id = auth.uid()
        or r.target_agent_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.lead_referrals r
    where r.id = referral_id
      and (
        public.bridge_is_active_member(r.source_organisation_id)
        or public.bridge_is_active_member(r.target_organisation_id)
        or r.source_agent_id = auth.uid()
        or r.target_agent_id = auth.uid()
      )
  )
);

drop policy if exists referral_status_events_agency_select on public.referral_status_events;
create policy referral_status_events_agency_select on public.referral_status_events
for select to authenticated
using (
  exists (
    select 1
    from public.lead_referrals r
    where r.id = referral_id
      and (
        public.bridge_is_active_member(r.source_organisation_id)
        or public.bridge_is_active_member(r.target_organisation_id)
        or r.source_agent_id = auth.uid()
        or r.target_agent_id = auth.uid()
        or lower(coalesce(r.source_agent_email, '')) = lower(public.bridge_current_email())
        or lower(coalesce(r.target_agent_email, '')) = lower(public.bridge_current_email())
      )
  )
);

drop policy if exists referral_status_events_agency_insert on public.referral_status_events;
create policy referral_status_events_agency_insert on public.referral_status_events
for insert to authenticated
with check (
  exists (
    select 1
    from public.lead_referrals r
    where r.id = referral_id
      and (
        public.bridge_is_active_member(r.source_organisation_id)
        or public.bridge_is_active_member(r.target_organisation_id)
        or r.source_agent_id = auth.uid()
        or r.target_agent_id = auth.uid()
      )
  )
);

drop policy if exists referral_invites_agency_select on public.referral_invites;
create policy referral_invites_agency_select on public.referral_invites
for select to authenticated
using (
  exists (
    select 1
    from public.lead_referrals r
    where r.id = referral_id
      and (
        public.bridge_is_active_member(r.source_organisation_id)
        or public.bridge_is_active_member(r.target_organisation_id)
        or r.source_agent_id = auth.uid()
        or r.target_agent_id = auth.uid()
        or lower(coalesce(r.source_agent_email, '')) = lower(public.bridge_current_email())
        or lower(coalesce(r.target_agent_email, '')) = lower(public.bridge_current_email())
      )
  )
);

drop policy if exists referral_invites_agency_write on public.referral_invites;
create policy referral_invites_agency_write on public.referral_invites
for all to authenticated
using (
  exists (
    select 1
    from public.lead_referrals r
    where r.id = referral_id
      and (
        public.bridge_is_active_member(r.source_organisation_id)
        or public.bridge_is_active_member(r.target_organisation_id)
        or r.source_agent_id = auth.uid()
        or r.target_agent_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.lead_referrals r
    where r.id = referral_id
      and (
        public.bridge_is_active_member(r.source_organisation_id)
        or public.bridge_is_active_member(r.target_organisation_id)
        or r.source_agent_id = auth.uid()
        or r.target_agent_id = auth.uid()
      )
  )
);

drop policy if exists referral_commission_events_agency_select on public.referral_commission_events;
create policy referral_commission_events_agency_select on public.referral_commission_events
for select to authenticated
using (
  exists (
    select 1
    from public.lead_referrals r
    where r.id = referral_id
      and (
        public.bridge_is_active_member(r.source_organisation_id)
        or public.bridge_is_active_member(r.target_organisation_id)
        or r.source_agent_id = auth.uid()
        or r.target_agent_id = auth.uid()
        or lower(coalesce(r.source_agent_email, '')) = lower(public.bridge_current_email())
        or lower(coalesce(r.target_agent_email, '')) = lower(public.bridge_current_email())
      )
  )
);

drop policy if exists referral_commission_events_agency_write on public.referral_commission_events;
create policy referral_commission_events_agency_write on public.referral_commission_events
for all to authenticated
using (
  exists (
    select 1
    from public.lead_referrals r
    where r.id = referral_id
      and (
        public.bridge_is_active_member(r.source_organisation_id)
        or public.bridge_is_active_member(r.target_organisation_id)
        or r.source_agent_id = auth.uid()
        or r.target_agent_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.lead_referrals r
    where r.id = referral_id
      and (
        public.bridge_is_active_member(r.source_organisation_id)
        or public.bridge_is_active_member(r.target_organisation_id)
        or r.source_agent_id = auth.uid()
        or r.target_agent_id = auth.uid()
      )
  )
);

create or replace function public.bridge_lookup_referral_invite_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.referral_invites%rowtype;
  referral_row public.lead_referrals%rowtype;
  client_row public.referral_clients%rowtype;
  agreement_row public.referral_agreements%rowtype;
begin
  select *
    into invite_row
  from public.referral_invites
  where token = nullif(trim(p_token), '')
  limit 1;

  if invite_row.id is null then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  select *
    into referral_row
  from public.lead_referrals
  where id = invite_row.referral_id
  limit 1;

  if referral_row.id is null then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  if invite_row.expires_at is not null and invite_row.expires_at < now() and invite_row.status in ('pending', 'sent') then
    update public.referral_invites
      set status = 'expired',
          updated_at = now()
    where id = invite_row.id;
    invite_row.status := 'expired';
  end if;

  select *
    into client_row
  from public.referral_clients
  where referral_id = referral_row.id
  order by created_at asc
  limit 1;

  select *
    into agreement_row
  from public.referral_agreements
  where referral_id = referral_row.id
  order by version desc
  limit 1;

  return jsonb_build_object(
    'success', true,
    'invite', jsonb_build_object(
      'id', invite_row.id,
      'token', invite_row.token,
      'email', invite_row.email,
      'status', invite_row.status,
      'expires_at', invite_row.expires_at,
      'accepted_at', invite_row.accepted_at,
      'created_at', invite_row.created_at
    ),
    'referral', jsonb_build_object(
      'id', referral_row.id,
      'source_lead_type', referral_row.source_lead_type,
      'source_agent_name', referral_row.source_agent_name,
      'source_agent_email', referral_row.source_agent_email,
      'target_agent_name', referral_row.target_agent_name,
      'target_agent_email', referral_row.target_agent_email,
      'target_company_name', referral_row.target_company_name,
      'recipient_scope', referral_row.recipient_scope,
      'status', referral_row.status,
      'commission_split_percentage', referral_row.commission_split_percentage,
      'commission_split_basis', referral_row.commission_split_basis,
      'agreement_status', referral_row.agreement_status,
      'created_at', referral_row.created_at
    ),
    'client', case
      when client_row.id is null then null
      else jsonb_build_object(
        'id', client_row.id,
        'client_type', client_row.client_type,
        'client_name', client_row.client_name,
        'client_email', client_row.client_email,
        'client_phone', client_row.client_phone,
        'client_context', client_row.client_context,
        'client_status', client_row.client_status
      )
    end,
    'agreement', case
      when agreement_row.id is null then null
      else jsonb_build_object(
        'id', agreement_row.id,
        'version', agreement_row.version,
        'status', agreement_row.status,
        'commission_split_percentage', agreement_row.commission_split_percentage,
        'commission_split_basis', agreement_row.commission_split_basis,
        'agreement_text', agreement_row.agreement_text,
        'sent_at', agreement_row.sent_at,
        'accepted_at', agreement_row.accepted_at,
        'declined_at', agreement_row.declined_at
      )
    end
  );
end;
$$;

create or replace function public.bridge_respond_referral_invite(
  p_token text,
  p_action text,
  p_actor_email text default null,
  p_actor_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.referral_invites%rowtype;
  referral_row public.lead_referrals%rowtype;
  agreement_row public.referral_agreements%rowtype;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  next_invite_status text;
  next_referral_status text;
  next_agreement_status text;
  next_client_status text;
begin
  if normalized_action not in ('accept', 'accepted', 'decline', 'declined') then
    return jsonb_build_object('success', false, 'code', 'invalid_action');
  end if;

  select *
    into invite_row
  from public.referral_invites
  where token = nullif(trim(p_token), '')
  limit 1;

  if invite_row.id is null then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  if invite_row.expires_at is not null and invite_row.expires_at < now() and invite_row.status in ('pending', 'sent') then
    update public.referral_invites
      set status = 'expired',
          updated_at = now()
    where id = invite_row.id;
    return jsonb_build_object('success', false, 'code', 'expired');
  end if;

  if invite_row.status = 'accepted' then
    return jsonb_build_object('success', false, 'code', 'already_accepted');
  end if;

  if invite_row.status in ('declined', 'expired', 'revoked') then
    return jsonb_build_object('success', false, 'code', invite_row.status);
  end if;

  select *
    into referral_row
  from public.lead_referrals
  where id = invite_row.referral_id
  limit 1;

  if referral_row.id is null then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  if normalized_action in ('accept', 'accepted') then
    next_invite_status := 'accepted';
    next_referral_status := 'accepted';
    next_agreement_status := 'accepted';
    next_client_status := 'accepted';
  else
    next_invite_status := 'declined';
    next_referral_status := 'declined';
    next_agreement_status := 'declined';
    next_client_status := 'archived';
  end if;

  update public.referral_invites
    set status = next_invite_status,
        accepted_at = case when next_invite_status = 'accepted' then now() else accepted_at end,
        accepted_by_user_id = case when next_invite_status = 'accepted' then auth.uid() else accepted_by_user_id end,
        updated_at = now()
  where id = invite_row.id;

  update public.lead_referrals
    set status = next_referral_status,
        agreement_status = next_agreement_status,
        updated_at = now()
  where id = referral_row.id;

  select *
    into agreement_row
  from public.referral_agreements
  where referral_id = referral_row.id
  order by version desc
  limit 1;

  if agreement_row.id is not null then
    update public.referral_agreements
      set status = next_agreement_status,
          accepted_at = case when next_agreement_status = 'accepted' then now() else accepted_at end,
          declined_at = case when next_agreement_status = 'declined' then now() else declined_at end,
          accepted_by_email = case when next_agreement_status = 'accepted' then coalesce(nullif(trim(p_actor_email), ''), invite_row.email) else accepted_by_email end,
          updated_at = now()
    where id = agreement_row.id;
  end if;

  update public.referral_clients
    set client_status = next_client_status,
        updated_at = now()
  where referral_id = referral_row.id;

  insert into public.referral_status_events (
    referral_id,
    from_status,
    to_status,
    event_type,
    event_note,
    actor_id,
    actor_email,
    metadata
  )
  values (
    referral_row.id,
    referral_row.status,
    next_referral_status,
    'invite_response',
    case when next_referral_status = 'accepted' then 'Referral invite accepted.' else 'Referral invite declined.' end,
    auth.uid(),
    coalesce(nullif(trim(p_actor_email), ''), invite_row.email),
    jsonb_build_object(
      'actor_name', nullif(trim(coalesce(p_actor_name, '')), ''),
      'invite_id', invite_row.id
    )
  );

  return public.bridge_lookup_referral_invite_by_token(p_token) || jsonb_build_object('response_status', next_referral_status);
end;
$$;

grant execute on function public.bridge_lookup_referral_invite_by_token(text) to anon, authenticated;
grant execute on function public.bridge_respond_referral_invite(text, text, text, text) to anon, authenticated;
grant select, insert, update, delete on table public.referral_commission_events to authenticated;

commit;
