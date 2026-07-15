begin;

-- Arch9 Command / CEO dashboard Phase 1
--
-- Establishes one trusted database contract for the executive homepage. The
-- browser receives aggregates and a bounded lead queue instead of downloading
-- whole operational tables and deriving business metrics client-side.

alter table if exists public.demo_enquiries
  add column if not exists assigned_to_user_id uuid references auth.users(id) on delete set null,
  add column if not exists priority text not null default 'normal',
  add column if not exists sales_stage text,
  add column if not exists next_action text,
  add column if not exists next_action_at timestamptz,
  add column if not exists contacted_at timestamptz,
  add column if not exists qualified_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists lost_reason text,
  add column if not exists converted_organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists internal_notes text;

update public.demo_enquiries
set sales_stage = case lower(coalesce(status, 'new'))
  when 'contacted' then 'contacted'
  when 'scheduled' then 'demo_scheduled'
  when 'closed' then 'closed'
  when 'spam' then 'spam'
  else 'new'
end
where sales_stage is null
   or sales_stage = '';

alter table if exists public.demo_enquiries
  alter column sales_stage set default 'new',
  alter column sales_stage set not null;

alter table if exists public.demo_enquiries
  drop constraint if exists demo_enquiries_priority_check;
alter table if exists public.demo_enquiries
  add constraint demo_enquiries_priority_check
  check (priority in ('low', 'normal', 'high', 'urgent'));

alter table if exists public.demo_enquiries
  drop constraint if exists demo_enquiries_sales_stage_check;
alter table if exists public.demo_enquiries
  add constraint demo_enquiries_sales_stage_check
  check (
    sales_stage in (
      'new',
      'contacted',
      'qualified',
      'demo_scheduled',
      'proposal',
      'won',
      'lost',
      'closed',
      'spam'
    )
  );

create index if not exists demo_enquiries_ceo_queue_idx
  on public.demo_enquiries (sales_stage, assigned_to_user_id, priority, created_at desc);
create index if not exists demo_enquiries_next_action_idx
  on public.demo_enquiries (next_action_at)
  where sales_stage not in ('won', 'lost', 'spam');
create index if not exists demo_enquiries_converted_organisation_idx
  on public.demo_enquiries (converted_organisation_id)
  where converted_organisation_id is not null;

create or replace function public.bridge_touch_demo_enquiries_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_bridge_touch_demo_enquiries_updated_at on public.demo_enquiries;
create trigger trg_bridge_touch_demo_enquiries_updated_at
before update on public.demo_enquiries
for each row execute function public.bridge_touch_demo_enquiries_updated_at();

revoke all on function public.bridge_touch_demo_enquiries_updated_at() from public, anon, authenticated, service_role;

-- The linked database ledger does not contain the earlier optional admin-event
-- migration. Reconcile the required event foundation here so this phase is
-- self-contained and safe on both drifted and fully migrated environments.
create table if not exists public.platform_revenue_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  commercial_deal_id uuid references public.commercial_deals(id) on delete set null,
  revenue_type text not null,
  amount_cents bigint not null default 0,
  currency text not null default 'ZAR',
  status text not null default 'pending',
  recognised_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.organisation_activity_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  activity_type text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.platform_integration_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  integration_key text not null,
  provider text,
  status text not null,
  severity text not null default 'warning',
  message text,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_activity_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  activity_type text not null,
  event_type text,
  title text not null,
  description text,
  summary text,
  severity text not null default 'info',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists platform_revenue_events_recognised_idx
  on public.platform_revenue_events (status, recognised_at desc);
create index if not exists platform_revenue_events_organisation_idx
  on public.platform_revenue_events (organisation_id, created_at desc);
create index if not exists organisation_activity_events_recent_idx
  on public.organisation_activity_events (occurred_at desc, organisation_id);
create index if not exists platform_integration_events_unresolved_idx
  on public.platform_integration_events (status, occurred_at desc)
  where resolved_at is null;
create index if not exists platform_activity_events_recent_idx
  on public.platform_activity_events (occurred_at desc);

alter table public.platform_revenue_events enable row level security;
alter table public.organisation_activity_events enable row level security;
alter table public.platform_integration_events enable row level security;
alter table public.platform_activity_events enable row level security;

create table if not exists public.platform_revenue_targets (
  id uuid primary key default gen_random_uuid(),
  month_start date not null,
  target_amount_cents bigint not null check (target_amount_cents >= 0),
  currency text not null default 'ZAR',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_revenue_targets_currency_check check (currency = upper(currency)),
  constraint platform_revenue_targets_month_unique unique (month_start, currency)
);

create index if not exists platform_revenue_targets_month_idx
  on public.platform_revenue_targets (month_start desc, currency);

alter table public.platform_revenue_targets enable row level security;

drop policy if exists platform_revenue_targets_ceo_read on public.platform_revenue_targets;
create policy platform_revenue_targets_ceo_read
on public.platform_revenue_targets
for select
to authenticated
using (public.bridge_is_platform_admin());

drop policy if exists platform_revenue_targets_ceo_write on public.platform_revenue_targets;

revoke insert, update, delete on public.platform_revenue_targets from authenticated;
grant select on public.platform_revenue_targets to authenticated;

create or replace function public.bridge_touch_platform_revenue_target_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_bridge_touch_platform_revenue_target_updated_at on public.platform_revenue_targets;
create trigger trg_bridge_touch_platform_revenue_target_updated_at
before update on public.platform_revenue_targets
for each row execute function public.bridge_touch_platform_revenue_target_updated_at();

revoke all on function public.bridge_touch_platform_revenue_target_updated_at() from public, anon, authenticated, service_role;

create or replace function public.arch9_admin_set_revenue_target_v1(
  p_month_start date,
  p_target_amount_cents bigint,
  p_currency text default 'ZAR',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_currency text := upper(coalesce(nullif(trim(p_currency), ''), 'ZAR'));
  v_target public.platform_revenue_targets%rowtype;
begin
  if not public.bridge_is_platform_admin() then
    raise exception 'CEO revenue target access is required.' using errcode = '42501';
  end if;

  if p_month_start is null or p_month_start <> date_trunc('month', p_month_start)::date then
    raise exception 'Revenue target month must be the first day of a month.' using errcode = '22023';
  end if;
  if p_target_amount_cents is null or p_target_amount_cents < 0 then
    raise exception 'Revenue target must be zero or greater.' using errcode = '22023';
  end if;
  if v_currency <> 'ZAR' then
    raise exception 'CEO dashboard Phase 1 supports ZAR targets only.' using errcode = '22023';
  end if;

  insert into public.platform_revenue_targets (
    month_start,
    target_amount_cents,
    currency,
    notes,
    created_by,
    updated_by
  )
  values (
    p_month_start,
    p_target_amount_cents,
    v_currency,
    nullif(trim(p_notes), ''),
    auth.uid(),
    auth.uid()
  )
  on conflict (month_start, currency)
  do update set
    target_amount_cents = excluded.target_amount_cents,
    notes = excluded.notes,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into v_target;

  insert into public.platform_activity_events (
    actor_user_id,
    activity_type,
    event_type,
    title,
    description,
    summary,
    severity,
    occurred_at
  )
  values (
    auth.uid(),
    'ceo_revenue_target_updated',
    'platform_revenue_target_updated',
    'Monthly revenue target updated',
    to_char(v_target.month_start, 'Mon YYYY'),
    jsonb_build_object(
      'targetId', v_target.id,
      'monthStart', v_target.month_start,
      'targetAmountCents', v_target.target_amount_cents,
      'currency', v_target.currency
    )::text,
    'info',
    now()
  );

  return jsonb_build_object(
    'id', v_target.id,
    'monthStart', v_target.month_start,
    'targetAmountCents', v_target.target_amount_cents,
    'currency', v_target.currency,
    'notes', v_target.notes,
    'updatedAt', v_target.updated_at
  );
end;
$$;

revoke all on function public.arch9_admin_set_revenue_target_v1(date, bigint, text, text) from public, anon, authenticated, service_role;
grant execute on function public.arch9_admin_set_revenue_target_v1(date, bigint, text, text) to authenticated;

-- Revenue events are the only source used for the CEO revenue metric. Source
-- identity makes synchronisation and backfill idempotent.
alter table if exists public.platform_revenue_events
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists platform_revenue_events_source_unique_idx
  on public.platform_revenue_events (source_type, source_id)
  where source_type is not null and source_id is not null;
create index if not exists platform_revenue_events_ceo_mtd_idx
  on public.platform_revenue_events (currency, recognised_at desc)
  where status in ('recognised', 'recognized');

create or replace function public.bridge_sync_billing_invoice_revenue_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if lower(coalesce(new.status, '')) = 'paid' and coalesce(new.amount, 0) > 0 then
    insert into public.platform_revenue_events (
      organisation_id,
      revenue_type,
      amount_cents,
      currency,
      status,
      recognised_at,
      source_type,
      source_id,
      source_metadata
    )
    values (
      new.organisation_id,
      'subscription_invoice',
      round(new.amount * 100)::bigint,
      'ZAR',
      'recognised',
      coalesce(new.paid_at, new.updated_at, now()),
      'billing_invoice',
      new.id,
      jsonb_strip_nulls(jsonb_build_object('invoiceNumber', new.invoice_number))
    )
    on conflict (source_type, source_id) where source_type is not null and source_id is not null
    do update set
      organisation_id = excluded.organisation_id,
      amount_cents = excluded.amount_cents,
      status = excluded.status,
      recognised_at = excluded.recognised_at,
      source_metadata = excluded.source_metadata;
  elsif tg_op = 'UPDATE' then
    update public.platform_revenue_events
    set
      status = 'reversed',
      source_metadata = coalesce(source_metadata, '{}'::jsonb)
        || jsonb_build_object('reversedAt', now(), 'invoiceStatus', new.status)
    where source_type = 'billing_invoice'
      and source_id = new.id
      and status in ('recognised', 'recognized');
  end if;

  return new;
end;
$$;

revoke all on function public.bridge_sync_billing_invoice_revenue_event() from public, anon, authenticated, service_role;

do $$
begin
  if to_regclass('public.billing_invoices') is not null then
    drop trigger if exists trg_bridge_sync_billing_invoice_revenue_event on public.billing_invoices;
    create trigger trg_bridge_sync_billing_invoice_revenue_event
    after insert or update of status, amount, paid_at on public.billing_invoices
    for each row execute function public.bridge_sync_billing_invoice_revenue_event();

    insert into public.platform_revenue_events (
      organisation_id,
      revenue_type,
      amount_cents,
      currency,
      status,
      recognised_at,
      source_type,
      source_id,
      source_metadata
    )
    select
      invoice.organisation_id,
      'subscription_invoice',
      round(invoice.amount * 100)::bigint,
      'ZAR',
      'recognised',
      coalesce(invoice.paid_at, invoice.updated_at, invoice.created_at),
      'billing_invoice',
      invoice.id,
      jsonb_strip_nulls(jsonb_build_object('invoiceNumber', invoice.invoice_number))
    from public.billing_invoices invoice
    where lower(coalesce(invoice.status, '')) = 'paid'
      and coalesce(invoice.amount, 0) > 0
    on conflict (source_type, source_id) where source_type is not null and source_id is not null
    do nothing;
  end if;

end;
$$;

create index if not exists organisation_users_ceo_active_agents_idx
  on public.organisation_users (status, role, last_active_at, created_at);
create index if not exists private_listings_ceo_active_idx
  on public.private_listings (listing_status, is_active, created_at);
create index if not exists commercial_listings_ceo_active_idx
  on public.commercial_listings (listing_status, created_at);
create index if not exists transactions_ceo_active_idx
  on public.transactions (is_active, lifecycle_state, last_meaningful_activity_at, created_at);
create index if not exists commercial_transactions_ceo_active_idx
  on public.commercial_transactions (status, created_at);
create index if not exists billing_invoices_ceo_attention_idx
  on public.billing_invoices (status, issued_at, paid_at);

create or replace function public.arch9_admin_ceo_dashboard_v1(
  p_start timestamptz default date_trunc('month', now()),
  p_end timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz := coalesce(p_start, date_trunc('month', now()));
  v_end timestamptz := coalesce(p_end, now());
  v_previous_start timestamptz;
  v_target_month date;
  v_result jsonb;
begin
  if not public.bridge_is_platform_admin() then
    raise exception 'CEO dashboard access is required.' using errcode = '42501';
  end if;

  if v_end <= v_start then
    raise exception 'Dashboard end must be after start.' using errcode = '22023';
  end if;

  v_previous_start := v_start - (v_end - v_start);
  v_target_month := date_trunc('month', least(v_end, now()))::date;

  with
  agent_memberships as (
    select
      ou.user_id,
      coalesce(ou.joined_at, ou.accepted_at, ou.created_at) as activated_at
    from public.organisation_users ou
    where lower(coalesce(ou.status, '')) = 'active'
      and lower(replace(coalesce(
        to_jsonb(ou) ->> 'workspace_role',
        to_jsonb(ou) ->> 'organisation_role',
        to_jsonb(ou) ->> 'app_role',
        ou.role,
        ''
      ), '-', '_')) in (
        'agent', 'estate_agent', 'real_estate_agent', 'sales_agent',
        'senior_agent', 'broker', 'commercial_broker'
      )
      and ou.user_id is not null
      and exists (
        select 1
        from public.organisations organisation
        where organisation.id = ou.organisation_id
          and lower(coalesce(to_jsonb(organisation) ->> 'status', 'active'))
            not in ('inactive', 'archived', 'deleted', 'cancelled', 'canceled', 'removed', 'suspended')
      )
  ),
  agent_metrics as (
    select
      count(distinct user_id)::integer as total,
      count(distinct user_id) filter (where activated_at >= v_start and activated_at < v_end)::integer as current_period,
      count(distinct user_id) filter (where activated_at >= v_previous_start and activated_at < v_start)::integer as previous_period
    from agent_memberships
  ),
  listing_rows as (
    select 'residential:' || listing.id::text as id, listing.created_at
    from public.private_listings listing
    where lower(coalesce(listing.listing_status, '')) in ('mandate_signed', 'active', 'under_offer')
      and coalesce(listing.is_active, false) = true
    union all
    select 'commercial:' || listing.id::text as id, listing.created_at
    from public.commercial_listings listing
    where lower(coalesce(listing.listing_status::text, '')) in ('coming_soon', 'active', 'under_offer')
      and lower(coalesce(listing.status, 'active')) = 'active'
  ),
  listing_metrics as (
    select
      count(*)::integer as total,
      count(*) filter (where created_at >= v_start and created_at < v_end)::integer as current_period,
      count(*) filter (where created_at >= v_previous_start and created_at < v_start)::integer as previous_period
    from listing_rows
  ),
  residential_transactions as (
    select
      'residential:' || tx.id::text as id,
      tx.organisation_id,
      tx.created_at,
      coalesce(tx.last_meaningful_activity_at, tx.updated_at, tx.created_at) as last_activity_at,
      tx.completed_at,
      tx.registered_at
    from public.transactions tx
    where coalesce(tx.is_active, true) = true
      and lower(coalesce(tx.lifecycle_state, 'active')) not in ('completed', 'closed', 'cancelled', 'canceled', 'archived', 'deleted', 'lost')
      and tx.completed_at is null
      and tx.archived_at is null
      and tx.cancelled_at is null
      and tx.registered_at is null
      and lower(concat_ws(' ', tx.stage, tx.current_main_stage)) !~ '(registered|completed|closed|cancelled|canceled|archived|deleted|lost)'
  ),
  commercial_active_transactions as (
    select
      'commercial:' || commercial_tx.id::text as id,
      commercial_tx.organisation_id,
      commercial_tx.created_at,
      commercial_tx.updated_at as last_activity_at,
      case when commercial_tx.status::text = 'completed' then commercial_tx.actual_close_date::timestamptz else null end as completed_at,
      null::timestamptz as registered_at
    from public.commercial_transactions commercial_tx
    where lower(coalesce(commercial_tx.status::text, '')) not in ('completed', 'lost', 'cancelled')
  ),
  active_transactions as (
    select * from residential_transactions
    union all
    select * from commercial_active_transactions
  ),
  transaction_metrics as (
    select
      count(*)::integer as total,
      count(*) filter (where created_at >= v_start and created_at < v_end)::integer as current_period,
      count(*) filter (where created_at >= v_previous_start and created_at < v_start)::integer as previous_period,
      count(*) filter (where last_activity_at < now() - interval '7 days')::integer as stalled
    from active_transactions
  ),
  completed_transactions as (
    select tx.id::text as id, coalesce(tx.registered_at, tx.completed_at) as completed_at
    from public.transactions tx
    where coalesce(tx.registered_at, tx.completed_at) is not null
    union all
    select 'commercial:' || commercial_tx.id::text, commercial_tx.actual_close_date::timestamptz
    from public.commercial_transactions commercial_tx
    where commercial_tx.status::text = 'completed'
      and commercial_tx.actual_close_date is not null
  ),
  revenue_metrics as (
    select
      coalesce(sum(event.amount_cents) filter (
        where event.recognised_at >= v_start and event.recognised_at < v_end
      ), 0)::bigint as current_cents,
      coalesce(sum(event.amount_cents) filter (
        where event.recognised_at >= v_previous_start and event.recognised_at < v_start
      ), 0)::bigint as previous_cents,
      count(*)::integer as recognised_event_count
    from public.platform_revenue_events event
    where event.status in ('recognised', 'recognized')
      and event.currency = 'ZAR'
  ),
  revenue_target as (
    select target.target_amount_cents
    from public.platform_revenue_targets target
    where target.month_start = v_target_month
      and target.currency = 'ZAR'
    limit 1
  ),
  lead_metrics as (
    select
      count(*) filter (where enquiry.created_at >= v_start and enquiry.created_at < v_end and enquiry.sales_stage <> 'spam')::integer as total,
      count(*) filter (where enquiry.created_at >= v_start and enquiry.created_at < v_end and enquiry.sales_stage = 'won')::integer as won,
      count(*) filter (where enquiry.created_at >= v_start and enquiry.created_at < v_end and enquiry.sales_stage = 'won' and enquiry.converted_organisation_id is not null)::integer as onboarded
    from public.demo_enquiries enquiry
  ),
  lead_queue as (
    select enquiry.*
    from public.demo_enquiries enquiry
    where enquiry.sales_stage not in ('won', 'lost', 'closed', 'spam')
    order by
      (enquiry.assigned_to_user_id is null) desc,
      case enquiry.priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 else 1 end desc,
      enquiry.created_at asc
    limit 12
  ),
  attention_metrics as (
    select
      (select count(*) from public.demo_enquiries enquiry
       where enquiry.sales_stage = 'new'
         and enquiry.assigned_to_user_id is null
         and enquiry.created_at < now() - interval '4 hours')::integer as unassigned_leads,
      (select count(*) from public.demo_enquiries enquiry
       where enquiry.sales_stage = 'won'
         and enquiry.converted_organisation_id is null
         and enquiry.updated_at < now() - interval '7 days')::integer as stalled_onboarding,
      (select stalled from transaction_metrics)::integer as stalled_transactions,
      (select count(*) from public.platform_integration_events event
       where event.resolved_at is null
         and lower(coalesce(event.status, '')) in ('failed', 'error', 'critical', 'down')
         and lower(concat_ws(' ', event.integration_key, event.provider, event.message)) ~ '(document|otp|template|pdf)')::integer as document_failures,
      (select count(*) from public.billing_invoices invoice
       where lower(coalesce(invoice.status, '')) = 'overdue'
         and invoice.paid_at is null)::integer as overdue_collections
  ),
  organisation_performance as (
    select
      organisation.id,
      coalesce(organisation.display_name, organisation.name, 'Organisation') as name,
      coalesce((
        select sum(event.amount_cents)
        from public.platform_revenue_events event
        where event.organisation_id = organisation.id
          and event.status in ('recognised', 'recognized')
          and event.currency = 'ZAR'
          and event.recognised_at >= v_start
          and event.recognised_at < v_end
      ), 0)::bigint as revenue_cents,
      (select count(*) from active_transactions active_tx where active_tx.organisation_id = organisation.id)::integer as active_transactions
    from public.organisations organisation
  ),
  top_organisations as (
    select *
    from organisation_performance
    where revenue_cents > 0 or active_transactions > 0
    order by revenue_cents desc, active_transactions desc, name asc
    limit 5
  )
  select jsonb_build_object(
    'version', 1,
    'generatedAt', now(),
    'range', jsonb_build_object('start', v_start, 'end', v_end),
    'metrics', jsonb_build_object(
      'activeAgents', jsonb_build_object(
        'value', agent.total,
        'currentPeriod', agent.current_period,
        'previousPeriod', agent.previous_period
      ),
      'activeListings', jsonb_build_object(
        'value', listing.total,
        'currentPeriod', listing.current_period,
        'previousPeriod', listing.previous_period
      ),
      'activeTransactions', jsonb_build_object(
        'value', transaction_metric.total,
        'currentPeriod', transaction_metric.current_period,
        'previousPeriod', transaction_metric.previous_period,
        'attentionCount', transaction_metric.stalled
      ),
      'revenueMtd', jsonb_build_object(
        'valueCents', case when revenue.recognised_event_count > 0 then revenue.current_cents else null end,
        'previousValueCents', case when revenue.recognised_event_count > 0 then revenue.previous_cents else null end,
        'currency', 'ZAR',
        'targetCents', target.target_amount_cents,
        'targetProgress', case
          when target.target_amount_cents > 0 and revenue.recognised_event_count > 0
            then round((revenue.current_cents::numeric / target.target_amount_cents::numeric) * 100, 1)
          else null
        end,
        'available', revenue.recognised_event_count > 0
      )
    ),
    'newBusinessIntake', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', lead.id,
        'organisationType', lead.role,
        'organisationName', lead.company,
        'contactName', trim(concat_ws(' ', lead.first_name, lead.last_name)),
        'email', lead.email,
        'phone', lead.phone,
        'businessSize', lead.business_size,
        'monthlyVolume', lead.monthly_volume,
        'source', lead.source,
        'priority', lead.priority,
        'stage', lead.sales_stage,
        'assignedToUserId', lead.assigned_to_user_id,
        'nextAction', lead.next_action,
        'nextActionAt', lead.next_action_at,
        'submittedAt', coalesce(lead.submitted_at, lead.created_at)
      ) order by lead.created_at asc)
      from lead_queue lead
    ), '[]'::jsonb),
    'attention', jsonb_build_array(
      jsonb_build_object('key', 'unassignedLeads', 'label', 'New leads unassigned', 'value', attention.unassigned_leads, 'severity', 'warning', 'path', '/admin/sales-pipeline?attention=unassigned'),
      jsonb_build_object('key', 'stalledOnboarding', 'label', 'Onboarding accounts stalled', 'value', attention.stalled_onboarding, 'severity', 'warning', 'path', '/admin/organisations?attention=onboarding'),
      jsonb_build_object('key', 'stalledTransactions', 'label', 'Transactions require attention', 'value', attention.stalled_transactions, 'severity', 'warning', 'path', '/admin/transactions?attention=stalled'),
      jsonb_build_object('key', 'documentFailures', 'label', 'Document failures', 'value', attention.document_failures, 'severity', 'critical', 'path', '/admin/platform-health?attention=documents'),
      jsonb_build_object('key', 'overdueCollections', 'label', 'Overdue collections', 'value', attention.overdue_collections, 'severity', 'critical', 'path', '/admin/revenue?attention=overdue')
    ),
    'businessPulse', jsonb_build_object(
      'leadConversion', case when lead.total > 0 then round((lead.won::numeric / lead.total::numeric) * 100, 1) else null end,
      'onboardingCompletion', case when lead.won > 0 then round((lead.onboarded::numeric / lead.won::numeric) * 100, 1) else null end,
      'transactionCompletion', case
        when transaction_metric.current_period > 0 then least(100, round(((select count(*) from completed_transactions completed where completed.completed_at >= v_start and completed.completed_at < v_end)::numeric / transaction_metric.current_period::numeric) * 100, 1))
        else null
      end,
      'revenueTarget', case
        when target.target_amount_cents > 0 and revenue.recognised_event_count > 0
          then round((revenue.current_cents::numeric / target.target_amount_cents::numeric) * 100, 1)
        else null
      end
    ),
    'topOrganisations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', organisation.id,
        'name', organisation.name,
        'revenueCents', organisation.revenue_cents,
        'activeTransactions', organisation.active_transactions
      ) order by organisation.revenue_cents desc, organisation.active_transactions desc, organisation.name asc)
      from top_organisations organisation
    ), '[]'::jsonb),
    'warnings', jsonb_strip_nulls(jsonb_build_object(
      'revenue', case when revenue.recognised_event_count = 0 then 'Recognised revenue events are not available yet.' else null end,
      'revenueTarget', case when target.target_amount_cents is null then 'No revenue target is configured for this month.' else null end
    ))
  )
  into v_result
  from agent_metrics agent
  cross join listing_metrics listing
  cross join transaction_metrics transaction_metric
  cross join revenue_metrics revenue
  cross join lead_metrics lead
  cross join attention_metrics attention
  left join revenue_target target on true;

  return v_result;
end;
$$;

revoke all on function public.arch9_admin_ceo_dashboard_v1(timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.arch9_admin_ceo_dashboard_v1(timestamptz, timestamptz) to authenticated;

create or replace function public.arch9_admin_update_demo_enquiry_v1(
  p_enquiry_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.demo_enquiries%rowtype;
  v_after public.demo_enquiries%rowtype;
  v_stage text;
  v_priority text;
  v_unknown jsonb;
begin
  if not public.bridge_is_platform_admin() then
    raise exception 'CEO lead workflow access is required.' using errcode = '42501';
  end if;

  if p_enquiry_id is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'A lead id and patch object are required.' using errcode = '22023';
  end if;

  v_unknown := p_patch - array[
    'salesStage', 'assignedToUserId', 'priority', 'nextAction', 'nextActionAt',
    'lostReason', 'convertedOrganisationId', 'internalNotes'
  ];
  if v_unknown <> '{}'::jsonb then
    raise exception 'Unsupported lead patch fields: %', v_unknown using errcode = '22023';
  end if;

  v_stage := nullif(trim(p_patch ->> 'salesStage'), '');
  if v_stage is not null and v_stage not in ('new', 'contacted', 'qualified', 'demo_scheduled', 'proposal', 'won', 'lost', 'spam') then
    raise exception 'Unsupported lead stage.' using errcode = '22023';
  end if;

  v_priority := nullif(trim(p_patch ->> 'priority'), '');
  if v_priority is not null and v_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Unsupported lead priority.' using errcode = '22023';
  end if;

  select * into v_before
  from public.demo_enquiries
  where id = p_enquiry_id
  for update;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  if v_stage = 'lost' and coalesce(nullif(trim(p_patch ->> 'lostReason'), ''), v_before.lost_reason) is null then
    raise exception 'A lost reason is required.' using errcode = '22023';
  end if;

  update public.demo_enquiries enquiry
  set
    sales_stage = case when p_patch ? 'salesStage' then coalesce(v_stage, enquiry.sales_stage) else enquiry.sales_stage end,
    status = case
      when not (p_patch ? 'salesStage') then enquiry.status
      when v_stage = 'new' then 'new'
      when v_stage in ('contacted', 'qualified') then 'contacted'
      when v_stage = 'demo_scheduled' then 'scheduled'
      when v_stage in ('proposal', 'won', 'lost') then 'closed'
      when v_stage = 'spam' then 'spam'
      else enquiry.status
    end,
    assigned_to_user_id = case when p_patch ? 'assignedToUserId' then nullif(p_patch ->> 'assignedToUserId', '')::uuid else enquiry.assigned_to_user_id end,
    priority = case when p_patch ? 'priority' then coalesce(v_priority, enquiry.priority) else enquiry.priority end,
    next_action = case when p_patch ? 'nextAction' then nullif(trim(p_patch ->> 'nextAction'), '') else enquiry.next_action end,
    next_action_at = case when p_patch ? 'nextActionAt' then nullif(p_patch ->> 'nextActionAt', '')::timestamptz else enquiry.next_action_at end,
    lost_reason = case when p_patch ? 'lostReason' then nullif(trim(p_patch ->> 'lostReason'), '') else enquiry.lost_reason end,
    converted_organisation_id = case when p_patch ? 'convertedOrganisationId' then nullif(p_patch ->> 'convertedOrganisationId', '')::uuid else enquiry.converted_organisation_id end,
    internal_notes = case when p_patch ? 'internalNotes' then nullif(trim(p_patch ->> 'internalNotes'), '') else enquiry.internal_notes end,
    contacted_at = case when v_stage = 'contacted' then coalesce(enquiry.contacted_at, now()) else enquiry.contacted_at end,
    qualified_at = case when v_stage = 'qualified' then coalesce(enquiry.qualified_at, now()) else enquiry.qualified_at end,
    closed_at = case when v_stage in ('won', 'lost', 'spam') then coalesce(enquiry.closed_at, now()) else enquiry.closed_at end
  where enquiry.id = p_enquiry_id
  returning * into v_after;

  insert into public.platform_activity_events (
    organisation_id,
    actor_user_id,
    activity_type,
    event_type,
    title,
    description,
    summary,
    severity,
    occurred_at
  )
  values (
    v_after.converted_organisation_id,
    auth.uid(),
    'ceo_lead_updated',
    'demo_enquiry_updated',
    'Business intake updated',
    coalesce(v_after.company, v_after.email),
    jsonb_build_object(
      'enquiryId', v_after.id,
      'beforeStage', v_before.sales_stage,
      'afterStage', v_after.sales_stage,
      'beforeOwner', v_before.assigned_to_user_id,
      'afterOwner', v_after.assigned_to_user_id,
      'changedFields', (
        select coalesce(jsonb_agg(field_name order by field_name), '[]'::jsonb)
        from jsonb_object_keys(p_patch) as fields(field_name)
      )
    )::text,
    'info',
    now()
  );

  return jsonb_build_object(
    'id', v_after.id,
    'organisationName', v_after.company,
    'contactName', trim(concat_ws(' ', v_after.first_name, v_after.last_name)),
    'email', v_after.email,
    'priority', v_after.priority,
    'stage', v_after.sales_stage,
    'assignedToUserId', v_after.assigned_to_user_id,
    'nextAction', v_after.next_action,
    'nextActionAt', v_after.next_action_at,
    'convertedOrganisationId', v_after.converted_organisation_id,
    'updatedAt', v_after.updated_at
  );
end;
$$;

revoke all on function public.arch9_admin_update_demo_enquiry_v1(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.arch9_admin_update_demo_enquiry_v1(uuid, jsonb) to authenticated;

commit;
