begin;

-- Arch9 marketing email is deliberately separate from transactional delivery.
-- Rows below are organisation-scoped and every send is represented by exactly
-- one recipient record before a provider call is made.
create table if not exists public.email_sender_identities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  from_email text not null check (from_email = lower(btrim(from_email))),
  reply_to_email text not null check (reply_to_email = lower(btrim(reply_to_email))),
  provider text not null default 'resend' check (provider in ('resend')),
  provider_identity_id text,
  domain_name text generated always as (split_part(from_email, '@', 2)) stored,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','failed','disabled')),
  verified_at timestamptz,
  last_verified_at timestamptz,
  sending_paused_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, from_email)
);

create table if not exists public.email_marketing_contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  source_type text not null default 'crm' check (source_type in ('crm','csv','manual','buyer','seller','tenant','landlord')),
  source_id uuid,
  email text not null check (email = lower(btrim(email))),
  first_name text,
  last_name text,
  full_name text,
  role_type text,
  assigned_user_id uuid references auth.users(id) on delete set null,
  lead_stage text,
  tags text[] not null default '{}',
  area text,
  is_valid_email boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, email)
);

-- One address can represent more than one CRM record. The contact projection
-- remains deduplicated for sending, while this table retains the source
-- lineage needed to explain inclusion and to attribute an outcome correctly.
create table if not exists public.email_marketing_contact_sources (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  marketing_contact_id uuid not null references public.email_marketing_contacts(id) on delete cascade,
  source_kind text not null check (source_kind in ('crm_contact','crm_lead','csv_import','manual')),
  source_id uuid,
  source_snapshot jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, source_kind, source_id)
);

create table if not exists public.contact_marketing_preferences (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email text not null check (email = lower(btrim(email))),
  marketing_consent_status text not null default 'unknown' check (marketing_consent_status in ('opted_in','opted_out','unknown')),
  consent_source text,
  consent_captured_at timestamptz,
  unsubscribed_at timestamptz,
  unsubscribe_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, email)
);

create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email text not null check (email = lower(btrim(email))),
  reason text not null check (reason in ('unsubscribe','hard_bounce','complaint','provider_suppression','invalid')),
  source text not null default 'arch9',
  created_at timestamptz not null default now(),
  unique (organisation_id, email)
);

-- A campaign has one clear purpose. Per-purpose subscriptions give recipients
-- a real preference centre without weakening the organisation-wide opt-out.
create table if not exists public.email_subscription_types (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) between 1 and 100),
  description text not null default '',
  is_active boolean not null default true,
  display_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, slug)
);

create table if not exists public.contact_email_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  subscription_type_id uuid not null references public.email_subscription_types(id) on delete cascade,
  email text not null check (email = lower(btrim(email))),
  status text not null default 'unsubscribed' check (status in ('subscribed','unsubscribed')),
  source text not null default 'preference_centre',
  consent_captured_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, subscription_type_id, email)
);

create table if not exists public.email_sending_policies (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  max_recipients_per_worker_run integer not null default 50 check (max_recipients_per_worker_run between 1 and 500),
  daily_recipient_limit integer not null default 500 check (daily_recipient_limit between 1 and 1000000),
  require_verified_identity boolean not null default true,
  paused_at timestamptz,
  pause_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The only live adapter in this release is no_charge. The profile and quote
-- snapshot make a future prepaid adapter additive rather than a sender rewrite.
create table if not exists public.email_billing_profiles (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  adapter_key text not null default 'no_charge' check (adapter_key in ('no_charge','prepaid_wallet')),
  currency text not null default 'ZAR' check (currency ~ '^[A-Z]{3}$'),
  unit_price numeric(12,4) not null default 0 check (unit_price >= 0),
  billing_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((adapter_key = 'no_charge' and billing_enabled = false) or adapter_key = 'prepaid_wallet')
);

-- Saved audiences contain filter rules only, never a copied contact list.
-- Dispatch resolves against current consent and suppression data every time.
create table if not exists public.email_saved_audiences (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 140),
  description text not null default '',
  filter_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name)
);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 140),
  category text not null default 'custom' check (category in ('listing','newsletter','market_update','announcement','custom')),
  design_json jsonb not null default '{}'::jsonb,
  html text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  sender_identity_id uuid references public.email_sender_identities(id) on delete restrict,
  subscription_type_id uuid references public.email_subscription_types(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 180),
  subject text not null check (length(btrim(subject)) between 1 and 250),
  preview_text text,
  reply_to_email text,
  audience_filter jsonb not null default '{}'::jsonb,
  audience_snapshot_at timestamptz,
  content_json jsonb not null default '{}'::jsonb,
  html text not null default '',
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','partially_failed','failed','cancelled','archived')),
  scheduled_for timestamptz,
  sending_started_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status <> 'scheduled') or scheduled_for is not null)
);

create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  contact_id uuid references public.email_marketing_contacts(id) on delete set null,
  email text not null check (email = lower(btrim(email))),
  recipient_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','opened','clicked','bounced','complained','unsubscribed','failed','suppressed')),
  provider_message_id text unique,
  tracking_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  send_attempts integer not null default 0,
  error_reason text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, email)
);

create table if not exists public.email_campaign_dispatch_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.email_campaigns(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  run_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_campaign_audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('created','duplicated','preflighted','scheduled','cancelled','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  recipient_id uuid references public.email_campaign_recipients(id) on delete set null,
  provider text not null default 'resend',
  provider_event_id text not null,
  event_type text not null check (event_type in ('sent','delivered','opened','clicked','bounced','complained','unsubscribed','failed')),
  url text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

-- Link records are campaign-scoped. Recipient tokens make tracked redirects
-- attributable without placing an email address in a public URL.
create table if not exists public.email_campaign_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  target_url text not null check (target_url ~* '^https?://'),
  tracking_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  unique (campaign_id, target_url)
);

create table if not exists public.email_usage_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  provider text not null default 'resend',
  provider_cost_estimate numeric(12,4) not null default 0,
  provider_cost_actual numeric(12,4) not null default 0,
  wallet_charge numeric(12,4) not null default 0,
  billing_adapter text not null default 'no_charge' check (billing_adapter in ('no_charge','prepaid_wallet')),
  pricing_snapshot jsonb not null default '{}'::jsonb,
  quoted_at timestamptz,
  finalised_at timestamptz,
  billing_status text not null default 'no_charge' check (billing_status in ('no_charge','quoted','charged','void')),
  created_at timestamptz not null default now(),
  unique (campaign_id)
);

create index if not exists email_campaigns_org_status_idx on public.email_campaigns (organisation_id, status, scheduled_for desc nulls last);
create index if not exists email_marketing_contacts_audience_idx on public.email_marketing_contacts (organisation_id, branch_id, role_type, lead_stage);
create index if not exists email_marketing_contact_sources_contact_idx on public.email_marketing_contact_sources (marketing_contact_id, source_kind);
create index if not exists email_campaign_recipients_dispatch_idx on public.email_campaign_recipients (campaign_id, status, created_at);
create index if not exists email_campaign_dispatch_jobs_ready_idx on public.email_campaign_dispatch_jobs (status, run_at);
create index if not exists email_campaign_audit_events_campaign_idx on public.email_campaign_audit_events (campaign_id, created_at desc);
create index if not exists email_campaign_recipients_org_email_idx on public.email_campaign_recipients (organisation_id, email);
create index if not exists email_events_campaign_type_idx on public.email_events (campaign_id, event_type, occurred_at desc);
create index if not exists email_campaign_links_campaign_idx on public.email_campaign_links (campaign_id, created_at);
create index if not exists contact_email_subscriptions_lookup_idx on public.contact_email_subscriptions (organisation_id, subscription_type_id, email, status);
create index if not exists email_sender_identities_domain_idx on public.email_sender_identities (organisation_id, domain_name, verification_status);
create index if not exists email_saved_audiences_org_updated_idx on public.email_saved_audiences (organisation_id, updated_at desc);

create or replace function public.email_campaign_set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$ begin new.updated_at := now(); return new; end $$;
create trigger email_sender_identities_updated before update on public.email_sender_identities for each row execute function public.email_campaign_set_updated_at();
create trigger email_marketing_contacts_updated before update on public.email_marketing_contacts for each row execute function public.email_campaign_set_updated_at();
create trigger email_marketing_contact_sources_updated before update on public.email_marketing_contact_sources for each row execute function public.email_campaign_set_updated_at();
create trigger contact_marketing_preferences_updated before update on public.contact_marketing_preferences for each row execute function public.email_campaign_set_updated_at();
create trigger email_subscription_types_updated before update on public.email_subscription_types for each row execute function public.email_campaign_set_updated_at();
create trigger contact_email_subscriptions_updated before update on public.contact_email_subscriptions for each row execute function public.email_campaign_set_updated_at();
create trigger email_sending_policies_updated before update on public.email_sending_policies for each row execute function public.email_campaign_set_updated_at();
create trigger email_billing_profiles_updated before update on public.email_billing_profiles for each row execute function public.email_campaign_set_updated_at();
create trigger email_saved_audiences_updated before update on public.email_saved_audiences for each row execute function public.email_campaign_set_updated_at();
create trigger email_templates_updated before update on public.email_templates for each row execute function public.email_campaign_set_updated_at();
create trigger email_campaigns_updated before update on public.email_campaigns for each row execute function public.email_campaign_set_updated_at();
create trigger email_campaign_recipients_updated before update on public.email_campaign_recipients for each row execute function public.email_campaign_set_updated_at();
create trigger email_campaign_dispatch_jobs_updated before update on public.email_campaign_dispatch_jobs for each row execute function public.email_campaign_set_updated_at();

-- Server-side capability boundary. Agents may save their own drafts; only a
-- principal/admin can schedule, send, cancel or see every campaign.
create or replace function public.email_campaign_can_send(p_organisation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.bridge_organisation_role_authority_level(public.bridge_membership_role(p_organisation_id)) >= 400
$$;

-- Internal projection from the established agency CRM. It deliberately stores
-- no consent decision: consent is owned only by contact_marketing_preferences.
-- This function is service-role only; the browser never gets a way to alter
-- CRM lineage or make an address eligible by bypassing consent/suppression.
create or replace function public.email_campaign_refresh_contact_projection(p_organisation_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if p_organisation_id is null then raise exception 'Organisation is required.' using errcode = '22023'; end if;
  with crm_rows as (
    select c.contact_id, c.organisation_id, lower(btrim(c.email)) as email,
      nullif(btrim(c.first_name),'') as first_name, nullif(btrim(c.last_name),'') as last_name,
      nullif(lower(btrim(c.contact_type)),'') as role_type,
      l.branch_id, l.assigned_user_id, nullif(btrim(l.stage),'') as lead_stage,
      nullif(btrim(l.area_interest),'') as area
    from public.contacts c
    left join lateral (
      select branch_id, assigned_user_id, stage, area_interest
      from public.leads
      where organisation_id=c.organisation_id and contact_id=c.contact_id
      order by updated_at desc nulls last limit 1
    ) l on true
    where c.organisation_id=p_organisation_id
      and c.email is not null
      and lower(btrim(c.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
  ), upserted as (
    insert into public.email_marketing_contacts (organisation_id, branch_id, source_type, source_id, email, first_name, last_name, full_name, role_type, assigned_user_id, lead_stage, area, is_valid_email)
    select organisation_id, branch_id, 'crm', contact_id, email, first_name, last_name,
      nullif(concat_ws(' ', first_name, last_name), ''), role_type, assigned_user_id, lead_stage, area, true
    from crm_rows
    on conflict (organisation_id,email) do update set
      branch_id=excluded.branch_id, first_name=excluded.first_name, last_name=excluded.last_name,
      full_name=excluded.full_name, role_type=excluded.role_type, assigned_user_id=excluded.assigned_user_id,
      lead_stage=excluded.lead_stage, area=excluded.area, is_valid_email=true, updated_at=now()
    returning id, organisation_id, email
  )
  insert into public.email_marketing_contact_sources (organisation_id, marketing_contact_id, source_kind, source_id, source_snapshot)
  select r.organisation_id, u.id, 'crm_contact', r.contact_id,
    jsonb_build_object('contactId',r.contact_id,'roleType',r.role_type,'leadStage',r.lead_stage,'area',r.area)
  from crm_rows r join upserted u on u.organisation_id=r.organisation_id and u.email=r.email
  on conflict (organisation_id,source_kind,source_id) do update set
    marketing_contact_id=excluded.marketing_contact_id, source_snapshot=excluded.source_snapshot, synced_at=now(), updated_at=now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Called only by trusted server workflows when an organisation enables email.
-- Defaults are deliberately opt-out until the recipient gives purpose-specific
-- consent; this prevents a CRM import from silently becoming a mailing list.
create or replace function public.email_campaign_ensure_subscription_types(p_organisation_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if p_organisation_id is null then raise exception 'Organisation is required.' using errcode = '22023'; end if;
  insert into public.email_subscription_types (organisation_id,slug,name,description,display_order)
  values
    (p_organisation_id,'listings-and-property-alerts','Listings & property alerts','New listings and property matches.',10),
    (p_organisation_id,'market-updates','Market updates','Local market insights and reports.',20),
    (p_organisation_id,'seller-communications','Seller communications','Seller advice and valuation updates.',30),
    (p_organisation_id,'events-and-show-days','Events & show days','Invitations and event reminders.',40),
    (p_organisation_id,'agency-news','Agency news','News from your Arch9 agency.',50)
  on conflict (organisation_id,slug) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- The exact pre-send count uses the same consent, subscription and filter
-- clauses as dispatch. It is callable only by an organisation member and
-- reveals an aggregate, not contact rows, through the privileged query.
create or replace function public.email_campaign_preview_audience(
  p_organisation_id uuid,
  p_subscription_type_id uuid,
  p_filter jsonb default '{}'::jsonb
) returns integer language plpgsql stable security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_organisation_id is null or p_subscription_type_id is null then return 0; end if;
  if not public.bridge_has_organisation_membership(p_organisation_id) then raise exception 'Not authorised.' using errcode = '42501'; end if;
  select count(*)::integer into v_count
  from public.email_marketing_contacts c
  left join public.email_suppressions s on s.organisation_id=c.organisation_id and s.email=c.email
  join public.contact_marketing_preferences p on p.organisation_id=c.organisation_id and p.email=c.email and p.marketing_consent_status='opted_in'
  join public.contact_email_subscriptions cs on cs.organisation_id=c.organisation_id and cs.email=c.email and cs.subscription_type_id=p_subscription_type_id and cs.status='subscribed'
  where c.organisation_id=p_organisation_id and c.is_valid_email and s.id is null
    and (p_filter->>'role_type' is null or c.role_type=p_filter->>'role_type')
    and (p_filter->>'branch_id' is null or c.branch_id::text=p_filter->>'branch_id')
    and (p_filter->>'assigned_user_id' is null or c.assigned_user_id::text=p_filter->>'assigned_user_id')
    and (p_filter->>'lead_stage' is null or c.lead_stage=p_filter->>'lead_stage')
    and (p_filter->>'area' is null or c.area=p_filter->>'area')
    and (p_filter->>'tag' is null or p_filter->>'tag' = any(c.tags))
    and (coalesce(jsonb_array_length(p_filter->'contact_ids'),0)=0 or c.id::text in (select value from jsonb_array_elements_text(p_filter->'contact_ids')));
  return coalesce(v_count,0);
end $$;

create or replace function public.email_campaign_preflight(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_campaign public.email_campaigns%rowtype; v_eligible integer := 0; v_checks jsonb := '[]'::jsonb; v_ready boolean;
begin
  select * into v_campaign from public.email_campaigns where id=p_campaign_id;
  if not found or not public.email_campaign_can_send(v_campaign.organisation_id) then raise exception 'Not authorised.' using errcode='42501'; end if;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','sender','ok',exists(select 1 from public.email_sender_identities i where i.id=v_campaign.sender_identity_id and i.organisation_id=v_campaign.organisation_id and i.verification_status='verified')));
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','subscription','ok',exists(select 1 from public.email_subscription_types st where st.id=v_campaign.subscription_type_id and st.organisation_id=v_campaign.organisation_id and st.is_active)));
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','policy','ok',not exists(select 1 from public.email_sending_policies sp where sp.organisation_id=v_campaign.organisation_id and sp.paused_at is not null)));
  if v_campaign.subscription_type_id is not null then v_eligible := public.email_campaign_preview_audience(v_campaign.organisation_id,v_campaign.subscription_type_id,v_campaign.audience_filter); end if;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('key','audience','ok',v_eligible > 0,'eligible_recipients',v_eligible));
  select bool_and((item->>'ok')::boolean) into v_ready from jsonb_array_elements(v_checks) item;
  insert into public.email_campaign_audit_events (organisation_id,campaign_id,actor_id,event_type,metadata) values (v_campaign.organisation_id,v_campaign.id,auth.uid(),'preflighted',jsonb_build_object('ready',coalesce(v_ready,false),'eligible_recipients',v_eligible));
  return jsonb_build_object('ready',coalesce(v_ready,false),'eligible_recipients',v_eligible,'checks',v_checks);
end $$;

create or replace function public.email_campaign_quote_usage(p_campaign_id uuid, p_recipient_count integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_campaign public.email_campaigns%rowtype; v_profile public.email_billing_profiles%rowtype; v_count integer; v_snapshot jsonb;
begin
  select * into v_campaign from public.email_campaigns where id=p_campaign_id;
  if not found or not public.email_campaign_can_send(v_campaign.organisation_id) then raise exception 'Not authorised.' using errcode='42501'; end if;
  v_count := coalesce(p_recipient_count,(select count(*) from public.email_campaign_recipients where campaign_id=v_campaign.id));
  select * into v_profile from public.email_billing_profiles where organisation_id=v_campaign.organisation_id;
  v_snapshot := jsonb_build_object('adapter',coalesce(v_profile.adapter_key,'no_charge'),'currency',coalesce(v_profile.currency,'ZAR'),'unit_price',coalesce(v_profile.unit_price,0),'billing_enabled',coalesce(v_profile.billing_enabled,false),'quoted_recipient_count',v_count);
  insert into public.email_usage_records (organisation_id,campaign_id,recipient_count,billing_adapter,pricing_snapshot,provider_cost_estimate,wallet_charge,billing_status,quoted_at)
  values (v_campaign.organisation_id,v_campaign.id,v_count,coalesce(v_profile.adapter_key,'no_charge'),v_snapshot,0,0,'no_charge',now())
  on conflict (campaign_id) do update set recipient_count=excluded.recipient_count,billing_adapter=excluded.billing_adapter,pricing_snapshot=excluded.pricing_snapshot,provider_cost_estimate=0,wallet_charge=0,billing_status='no_charge',quoted_at=now();
  return jsonb_build_object('recipient_count',v_count,'currency',coalesce(v_profile.currency,'ZAR'),'estimated_charge',0,'billing_status','no_charge','adapter',coalesce(v_profile.adapter_key,'no_charge'));
end $$;

create or replace function public.email_campaign_duplicate(p_campaign_id uuid, p_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_source public.email_campaigns%rowtype; v_id uuid;
begin
  select * into v_source from public.email_campaigns where id=p_campaign_id;
  if not found or not public.bridge_has_organisation_membership(v_source.organisation_id) then raise exception 'Not authorised.' using errcode='42501'; end if;
  insert into public.email_campaigns (organisation_id,sender_identity_id,subscription_type_id,name,subject,preview_text,reply_to_email,audience_filter,content_json,html,status,created_by,updated_by)
  values (v_source.organisation_id,v_source.sender_identity_id,v_source.subscription_type_id,coalesce(nullif(btrim(p_name),''),v_source.name || ' (copy)'),v_source.subject,v_source.preview_text,v_source.reply_to_email,v_source.audience_filter,v_source.content_json,v_source.html,'draft',auth.uid(),auth.uid()) returning id into v_id;
  insert into public.email_campaign_audit_events (organisation_id,campaign_id,actor_id,event_type,metadata) values (v_source.organisation_id,v_id,auth.uid(),'duplicated',jsonb_build_object('source_campaign_id',v_source.id));
  return v_id;
end $$;

create or replace function public.email_campaign_archive(p_campaign_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign public.email_campaigns%rowtype;
begin
  select * into v_campaign from public.email_campaigns where id=p_campaign_id for update;
  if not found or not public.email_campaign_can_send(v_campaign.organisation_id) then raise exception 'Not authorised.' using errcode='42501'; end if;
  if v_campaign.status not in ('draft','sent','partially_failed','failed','cancelled') then raise exception 'Only completed or inactive campaigns can be archived.' using errcode='22023'; end if;
  update public.email_campaigns set status='archived',updated_by=auth.uid() where id=v_campaign.id;
  insert into public.email_campaign_audit_events (organisation_id,campaign_id,actor_id,event_type) values (v_campaign.organisation_id,v_campaign.id,auth.uid(),'archived');
end $$;

create or replace view public.email_campaign_link_performance with (security_invoker = true) as
select l.campaign_id, l.organisation_id, l.target_url,
  count(e.id)::integer as clicks,
  count(distinct e.recipient_id)::integer as unique_clickers,
  max(e.occurred_at) as last_clicked_at
from public.email_campaign_links l
left join public.email_events e on e.campaign_id=l.campaign_id and e.event_type='clicked' and e.url=l.target_url
group by l.campaign_id,l.organisation_id,l.target_url;

create or replace function public.email_campaign_guard_immutable_snapshot()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status not in ('draft','scheduled') and (
    new.audience_filter is distinct from old.audience_filter or new.content_json is distinct from old.content_json or
    new.html is distinct from old.html or new.subject is distinct from old.subject or new.sender_identity_id is distinct from old.sender_identity_id or
    new.subscription_type_id is distinct from old.subscription_type_id
  ) then raise exception 'Campaign content and audience are immutable after sending starts.' using errcode = '22023'; end if;
  return new;
end $$;
create trigger email_campaigns_immutable_snapshot before update on public.email_campaigns for each row execute function public.email_campaign_guard_immutable_snapshot();

-- Snapshot the eligible audience exactly once. Suppressions are checked here
-- and again by the worker; no caller can supply a bypass flag.
create or replace function public.email_campaign_prepare_dispatch(p_campaign_id uuid, p_send_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_campaign public.email_campaigns%rowtype; v_count integer;
begin
  select * into v_campaign from public.email_campaigns where id = p_campaign_id for update;
  if not found or not public.email_campaign_can_send(v_campaign.organisation_id) then raise exception 'Not authorised to schedule this campaign.' using errcode = '42501'; end if;
  if v_campaign.status not in ('draft','scheduled') then raise exception 'Only an unsent campaign can be scheduled.' using errcode = '22023'; end if;
  if v_campaign.subscription_type_id is null or not exists (select 1 from public.email_subscription_types st where st.id=v_campaign.subscription_type_id and st.organisation_id=v_campaign.organisation_id and st.is_active) then raise exception 'Choose an active email subscription type before scheduling.' using errcode = '22023'; end if;
  if exists (select 1 from public.email_sending_policies sp where sp.organisation_id=v_campaign.organisation_id and sp.paused_at is not null) then raise exception 'Sending is paused for this organisation.' using errcode = '22023'; end if;
  if not exists (select 1 from public.email_sender_identities i where i.id = v_campaign.sender_identity_id and i.organisation_id = v_campaign.organisation_id and i.verification_status = 'verified') then raise exception 'A verified sender identity is required.' using errcode = '22023'; end if;
  insert into public.email_campaign_recipients (organisation_id, campaign_id, contact_id, email, recipient_snapshot)
  select c.organisation_id, v_campaign.id, c.id, c.email,
    jsonb_build_object('first_name',c.first_name,'last_name',c.last_name,'full_name',c.full_name,'agent_name','', 'agency_name','', 'branch_name','')
  from public.email_marketing_contacts c
  left join public.email_suppressions s on s.organisation_id=c.organisation_id and s.email=c.email
  left join public.contact_marketing_preferences p on p.organisation_id=c.organisation_id and p.email=c.email
  join public.contact_email_subscriptions cs on cs.organisation_id=c.organisation_id and cs.email=c.email and cs.subscription_type_id=v_campaign.subscription_type_id and cs.status='subscribed'
  where c.organisation_id=v_campaign.organisation_id and c.is_valid_email
    and s.id is null and coalesce(p.marketing_consent_status,'unknown') = 'opted_in'
    and (v_campaign.audience_filter->>'role_type' is null or c.role_type = v_campaign.audience_filter->>'role_type')
    and (v_campaign.audience_filter->>'branch_id' is null or c.branch_id::text = v_campaign.audience_filter->>'branch_id')
    and (v_campaign.audience_filter->>'assigned_user_id' is null or c.assigned_user_id::text = v_campaign.audience_filter->>'assigned_user_id')
    and (v_campaign.audience_filter->>'lead_stage' is null or c.lead_stage = v_campaign.audience_filter->>'lead_stage')
    and (v_campaign.audience_filter->>'area' is null or c.area = v_campaign.audience_filter->>'area')
    and (v_campaign.audience_filter->>'tag' is null or v_campaign.audience_filter->>'tag' = any(c.tags))
    and (coalesce(jsonb_array_length(v_campaign.audience_filter->'contact_ids'),0)=0 or c.id::text in (select value from jsonb_array_elements_text(v_campaign.audience_filter->'contact_ids')))
  on conflict (campaign_id,email) do nothing;
  get diagnostics v_count = row_count;
  update public.email_campaigns set status = case when p_send_at <= now() then 'sending' else 'scheduled' end, scheduled_for=p_send_at, audience_snapshot_at=coalesce(audience_snapshot_at,now()), updated_by=auth.uid() where id=v_campaign.id;
  insert into public.email_campaign_audit_events (organisation_id,campaign_id,actor_id,event_type,metadata) values (v_campaign.organisation_id,v_campaign.id,auth.uid(),'scheduled',jsonb_build_object('scheduled_for',p_send_at,'eligible_recipients',v_count));
  insert into public.email_campaign_dispatch_jobs (campaign_id, organisation_id, run_at)
  values (v_campaign.id, v_campaign.organisation_id, p_send_at)
  on conflict (campaign_id) do update set run_at=excluded.run_at, status='queued', last_error=null, locked_at=null;
  perform public.email_campaign_quote_usage(v_campaign.id,(select count(*) from public.email_campaign_recipients where campaign_id=v_campaign.id));
  return jsonb_build_object('campaign_id',v_campaign.id,'added_recipients',v_count,'scheduled_for',p_send_at);
end $$;

create or replace function public.email_campaign_cancel(p_campaign_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.email_campaigns%rowtype; begin
  select * into v from public.email_campaigns where id=p_campaign_id for update;
  if not found or not public.email_campaign_can_send(v.organisation_id) then raise exception 'Not authorised.' using errcode='42501'; end if;
  if v.status not in ('draft','scheduled') then raise exception 'A campaign cannot be cancelled after sending starts.' using errcode='22023'; end if;
  update public.email_campaigns set status='cancelled',cancelled_at=now(),updated_by=auth.uid() where id=p_campaign_id;
  insert into public.email_campaign_audit_events (organisation_id,campaign_id,actor_id,event_type) values (v.organisation_id,v.id,auth.uid(),'cancelled');
end $$;

create or replace view public.email_campaign_performance as
select c.id campaign_id, c.organisation_id,
 count(r.id)::integer recipients,
 count(*) filter (where r.status in ('delivered','opened','clicked'))::integer delivered,
 count(*) filter (where r.status in ('opened','clicked'))::integer opened,
 count(*) filter (where r.status='clicked')::integer clicked,
 count(*) filter (where r.status='bounced')::integer bounced,
 count(*) filter (where r.status='unsubscribed')::integer unsubscribed,
 count(*) filter (where r.status='failed')::integer failed
from public.email_campaigns c left join public.email_campaign_recipients r on r.campaign_id=c.id group by c.id,c.organisation_id;
alter view public.email_campaign_performance set (security_invoker = true);

create or replace view public.email_deliverability_health with (security_invoker = true) as
select c.organisation_id, c.sender_identity_id,
  count(r.id)::integer as recipients,
  count(*) filter (where r.status in ('sent','delivered','opened','clicked'))::integer as sent,
  count(*) filter (where r.status in ('delivered','opened','clicked'))::integer as delivered,
  count(*) filter (where r.status='bounced')::integer as bounced,
  count(*) filter (where r.status='complained')::integer as complaints,
  count(*) filter (where r.status='unsubscribed')::integer as unsubscribed,
  case when count(r.id) = 0 then 'warming'
       when count(*) filter (where r.status='complained')::numeric / count(r.id) > 0.001 then 'paused'
       when count(*) filter (where r.status='bounced')::numeric / count(r.id) > 0.05 then 'warning'
       else 'healthy' end as health_status
from public.email_campaigns c left join public.email_campaign_recipients r on r.campaign_id=c.id
group by c.organisation_id,c.sender_identity_id;

create or replace view public.email_campaign_daily_performance with (security_invoker = true) as
select c.organisation_id,
  (coalesce(r.sent_at,c.sent_at,c.created_at) at time zone 'UTC')::date as metric_date,
  count(r.id)::integer as recipients,
  count(*) filter (where r.status in ('sent','delivered','opened','clicked'))::integer as sent,
  count(*) filter (where r.status in ('delivered','opened','clicked'))::integer as delivered,
  count(*) filter (where r.status in ('opened','clicked'))::integer as opened,
  count(*) filter (where r.status='clicked')::integer as clicked,
  count(*) filter (where r.status='bounced')::integer as bounced,
  count(*) filter (where r.status='unsubscribed')::integer as unsubscribed
from public.email_campaigns c
left join public.email_campaign_recipients r on r.campaign_id=c.id
where c.status not in ('draft','archived')
group by c.organisation_id,(coalesce(r.sent_at,c.sent_at,c.created_at) at time zone 'UTC')::date;

create or replace view public.email_campaign_category_performance with (security_invoker = true) as
select c.organisation_id, st.id as subscription_type_id, st.name as subscription_type,
  count(r.id)::integer as recipients,
  count(*) filter (where r.status in ('delivered','opened','clicked'))::integer as delivered,
  count(*) filter (where r.status in ('opened','clicked'))::integer as opened,
  count(*) filter (where r.status='clicked')::integer as clicked,
  count(*) filter (where r.status='bounced')::integer as bounced,
  count(*) filter (where r.status='unsubscribed')::integer as unsubscribed
from public.email_campaigns c
join public.email_subscription_types st on st.id=c.subscription_type_id
left join public.email_campaign_recipients r on r.campaign_id=c.id
group by c.organisation_id,st.id,st.name;

alter table public.email_sender_identities enable row level security;
alter table public.email_marketing_contacts enable row level security;
alter table public.email_marketing_contact_sources enable row level security;
alter table public.contact_marketing_preferences enable row level security;
alter table public.email_suppressions enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;
alter table public.email_campaign_dispatch_jobs enable row level security;
alter table public.email_campaign_audit_events enable row level security;
alter table public.email_events enable row level security;
alter table public.email_campaign_links enable row level security;
alter table public.email_usage_records enable row level security;
alter table public.email_subscription_types enable row level security;
alter table public.contact_email_subscriptions enable row level security;
alter table public.email_sending_policies enable row level security;
alter table public.email_billing_profiles enable row level security;
alter table public.email_saved_audiences enable row level security;

grant select,insert,update on public.email_sender_identities, public.email_marketing_contacts, public.contact_marketing_preferences, public.email_templates, public.email_campaigns to authenticated;
grant select,insert,update on public.email_subscription_types, public.contact_email_subscriptions, public.email_sending_policies to authenticated;
grant select,insert,update on public.email_billing_profiles to authenticated;
grant select,insert,update,delete on public.email_saved_audiences to authenticated;
grant select on public.email_campaign_recipients, public.email_events, public.email_usage_records, public.email_campaign_performance, public.email_deliverability_health to authenticated;
grant select on public.email_campaign_audit_events to authenticated;
grant select on public.email_campaign_links, public.email_campaign_link_performance to authenticated;
grant select on public.email_campaign_daily_performance, public.email_campaign_category_performance to authenticated;
grant execute on function public.email_campaign_can_send(uuid), public.email_campaign_prepare_dispatch(uuid,timestamptz), public.email_campaign_cancel(uuid) to authenticated;
revoke all on function public.email_campaign_refresh_contact_projection(uuid) from public, anon, authenticated;
revoke all on function public.email_campaign_ensure_subscription_types(uuid) from public, anon, authenticated;
revoke all on function public.email_campaign_preview_audience(uuid,uuid,jsonb) from public, anon;
revoke all on function public.email_campaign_can_send(uuid), public.email_campaign_prepare_dispatch(uuid,timestamptz), public.email_campaign_cancel(uuid) from public;
grant execute on function public.email_campaign_can_send(uuid), public.email_campaign_prepare_dispatch(uuid,timestamptz), public.email_campaign_cancel(uuid) to authenticated;
grant execute on function public.email_campaign_preview_audience(uuid,uuid,jsonb) to authenticated;
revoke all on function public.email_campaign_preflight(uuid), public.email_campaign_duplicate(uuid,text), public.email_campaign_archive(uuid) from public, anon;
revoke all on function public.email_campaign_quote_usage(uuid,integer) from public, anon;
grant execute on function public.email_campaign_preflight(uuid), public.email_campaign_duplicate(uuid,text), public.email_campaign_archive(uuid) to authenticated;
grant execute on function public.email_campaign_quote_usage(uuid,integer) to authenticated;

create policy email_sender_identities_read_member on public.email_sender_identities for select to authenticated using (public.bridge_has_organisation_membership(organisation_id));
create policy email_sender_identities_create_admin on public.email_sender_identities for insert to authenticated with check (public.email_campaign_can_send(organisation_id) and verification_status = 'pending');
create policy email_sender_identities_update_admin on public.email_sender_identities for update to authenticated using (public.email_campaign_can_send(organisation_id)) with check (public.email_campaign_can_send(organisation_id) and verification_status in ('pending','disabled'));
create policy email_marketing_contacts_member on public.email_marketing_contacts for all to authenticated using (public.bridge_has_organisation_membership(organisation_id)) with check (public.bridge_has_organisation_membership(organisation_id));
create policy email_marketing_contact_sources_read_admin on public.email_marketing_contact_sources for select to authenticated using (public.email_campaign_can_send(organisation_id));
create policy contact_marketing_preferences_member on public.contact_marketing_preferences for all to authenticated using (public.bridge_has_organisation_membership(organisation_id)) with check (public.bridge_has_organisation_membership(organisation_id));
create policy email_subscription_types_member on public.email_subscription_types for select to authenticated using (public.bridge_has_organisation_membership(organisation_id));
create policy email_subscription_types_admin on public.email_subscription_types for all to authenticated using (public.email_campaign_can_send(organisation_id)) with check (public.email_campaign_can_send(organisation_id));
create policy contact_email_subscriptions_admin on public.contact_email_subscriptions for all to authenticated using (public.email_campaign_can_send(organisation_id)) with check (public.email_campaign_can_send(organisation_id));
create policy email_sending_policies_admin on public.email_sending_policies for all to authenticated using (public.email_campaign_can_send(organisation_id)) with check (public.email_campaign_can_send(organisation_id));
create policy email_billing_profiles_admin on public.email_billing_profiles for all to authenticated using (public.email_campaign_can_send(organisation_id)) with check (public.email_campaign_can_send(organisation_id));
create policy email_saved_audiences_member on public.email_saved_audiences for all to authenticated using (public.bridge_has_organisation_membership(organisation_id)) with check (public.bridge_has_organisation_membership(organisation_id));
create policy email_templates_member on public.email_templates for all to authenticated using (public.bridge_has_organisation_membership(organisation_id)) with check (public.bridge_has_organisation_membership(organisation_id));
create policy email_campaigns_member on public.email_campaigns for select to authenticated using (public.email_campaign_can_send(organisation_id) or created_by = auth.uid());
create policy email_campaigns_create_member on public.email_campaigns for insert to authenticated with check (public.bridge_has_organisation_membership(organisation_id) and created_by=auth.uid());
create policy email_campaigns_edit_draft on public.email_campaigns for update to authenticated using ((public.email_campaign_can_send(organisation_id) or created_by = auth.uid()) and status in ('draft','scheduled')) with check ((public.email_campaign_can_send(organisation_id) or created_by = auth.uid()) and status in ('draft','scheduled','cancelled'));
create policy email_campaign_recipients_member on public.email_campaign_recipients for select to authenticated using (public.bridge_has_organisation_membership(organisation_id));
create policy email_campaign_audit_events_admin on public.email_campaign_audit_events for select to authenticated using (public.email_campaign_can_send(organisation_id));
create policy email_events_member on public.email_events for select to authenticated using (public.bridge_has_organisation_membership(organisation_id));
create policy email_campaign_links_member on public.email_campaign_links for select to authenticated using (public.bridge_has_organisation_membership(organisation_id));
create policy email_usage_records_member on public.email_usage_records for select to authenticated using (public.bridge_has_organisation_membership(organisation_id));

commit;
