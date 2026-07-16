begin;

create table if not exists public.attorney_lead_quotes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  lead_id uuid not null,
  quote_number text not null,
  version_number integer not null,
  status text not null default 'draft',
  currency text not null default 'ZAR',
  professional_fee numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  disbursements numeric(14,2) not null default 0,
  total_amount numeric(14,2) generated always as (professional_fee + vat_amount + disbursements) stored,
  valid_until date not null,
  internal_note text,
  decision_reason text,
  created_by uuid references auth.users(id) on delete set null,
  sent_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_lead_quotes_lead_org_fkey
    foreign key (lead_id, organisation_id)
    references public.leads(lead_id, organisation_id)
    on delete cascade,
  constraint attorney_lead_quotes_number_check
    check (quote_number ~ '^AQ-[0-9]{4}-[0-9]{6}$'),
  constraint attorney_lead_quotes_version_check check (version_number >= 1),
  constraint attorney_lead_quotes_status_check
    check (status in ('draft', 'sent', 'accepted', 'declined', 'expired', 'superseded')),
  constraint attorney_lead_quotes_currency_check check (currency = 'ZAR'),
  constraint attorney_lead_quotes_amounts_check
    check (
      professional_fee >= 0 and professional_fee <= 9999999999.99
      and vat_amount >= 0 and vat_amount <= 9999999999.99
      and disbursements >= 0 and disbursements <= 9999999999.99
      and professional_fee + vat_amount + disbursements > 0
    ),
  constraint attorney_lead_quotes_note_check
    check (internal_note is null or char_length(internal_note) <= 2000),
  constraint attorney_lead_quotes_reason_check
    check (decision_reason is null or char_length(decision_reason) <= 1000),
  constraint attorney_lead_quotes_state_check
    check (
      (status = 'draft' and sent_at is null and decided_at is null)
      or (status in ('sent', 'expired', 'superseded') and sent_at is not null and decided_at is null)
      or (status in ('accepted', 'declined') and sent_at is not null and decided_at is not null)
    )
);

create unique index if not exists attorney_lead_quotes_org_number_unique_idx
  on public.attorney_lead_quotes (organisation_id, quote_number);
create unique index if not exists attorney_lead_quotes_lead_version_unique_idx
  on public.attorney_lead_quotes (organisation_id, lead_id, version_number);
create unique index if not exists attorney_lead_quotes_one_accepted_idx
  on public.attorney_lead_quotes (organisation_id, lead_id)
  where status = 'accepted';
create index if not exists attorney_lead_quotes_lead_created_idx
  on public.attorney_lead_quotes (organisation_id, lead_id, created_at desc);

create or replace function public.bridge_touch_attorney_lead_quote()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists trg_attorney_lead_quotes_updated_at on public.attorney_lead_quotes;
create trigger trg_attorney_lead_quotes_updated_at
before update on public.attorney_lead_quotes
for each row execute function public.bridge_touch_attorney_lead_quote();

alter table public.attorney_lead_quotes enable row level security;
drop policy if exists attorney_lead_quotes_select on public.attorney_lead_quotes;
create policy attorney_lead_quotes_select
on public.attorney_lead_quotes for select to authenticated
using (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = attorney_lead_quotes.lead_id
      and lead.organisation_id = attorney_lead_quotes.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'view'
      )
  )
);

revoke all on table public.attorney_lead_quotes from public, anon, authenticated;
grant select on table public.attorney_lead_quotes to authenticated;

create or replace function public.bridge_create_attorney_lead_quote(
  p_organisation_id uuid,
  p_lead_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_quote public.attorney_lead_quotes%rowtype;
  v_professional numeric(14,2);
  v_vat numeric(14,2);
  v_disbursements numeric(14,2);
  v_valid_until date;
  v_version integer;
  v_sequence integer;
begin
  select lead.* into v_lead
  from public.leads lead
  where lead.organisation_id = p_organisation_id
    and lead.lead_id = p_lead_id
    and lead.lead_domain = 'attorney'
  for update;
  if not found then raise exception 'Attorney Lead not found'; end if;
  if not public.bridge_attorney_lead_can_access(
    v_lead.organisation_id, v_lead.assigned_user_id, v_lead.branch_id, 'edit'
  ) then raise exception 'Not authorised to create an Attorney Lead quote'; end if;
  if v_lead.converted_transaction_id is not null then
    raise exception 'Converted Attorney Leads cannot receive new quotes';
  end if;
  if v_lead.status <> 'open' then
    raise exception 'Only open Attorney Leads can receive new quotes';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 8192 then
    raise exception 'Invalid Attorney Lead quote payload';
  end if;

  v_professional := coalesce(nullif(trim(p_payload ->> 'professional_fee'), '')::numeric, 0);
  v_vat := coalesce(nullif(trim(p_payload ->> 'vat_amount'), '')::numeric, 0);
  v_disbursements := coalesce(nullif(trim(p_payload ->> 'disbursements'), '')::numeric, 0);
  v_valid_until := coalesce(nullif(trim(p_payload ->> 'valid_until'), '')::date, current_date + 14);
  if v_professional < 0 or v_vat < 0 or v_disbursements < 0
     or v_professional > 9999999999.99 or v_vat > 9999999999.99 or v_disbursements > 9999999999.99
     or v_professional + v_vat + v_disbursements <= 0 then
    raise exception 'Enter valid Attorney Lead quote amounts';
  end if;
  if v_valid_until < current_date or v_valid_until > current_date + 365 then
    raise exception 'Quote validity must be between today and 365 days from today';
  end if;
  if char_length(coalesce(p_payload ->> 'internal_note', '')) > 2000 then
    raise exception 'Attorney Lead quote note is too long';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('attorney-quote:' || p_organisation_id::text, 0));
  select coalesce(max(quote.version_number), 0) + 1 into v_version
  from public.attorney_lead_quotes quote
  where quote.organisation_id = p_organisation_id and quote.lead_id = p_lead_id;
  select count(*)::integer + 1 into v_sequence
  from public.attorney_lead_quotes quote
  where quote.organisation_id = p_organisation_id
    and extract(year from quote.created_at) = extract(year from current_date);

  insert into public.attorney_lead_quotes (
    organisation_id, lead_id, quote_number, version_number,
    professional_fee, vat_amount, disbursements, valid_until, internal_note, created_by
  ) values (
    p_organisation_id, p_lead_id,
    'AQ-' || to_char(current_date, 'YYYY') || '-' || lpad(v_sequence::text, 6, '0'),
    v_version, v_professional, v_vat, v_disbursements, v_valid_until,
    nullif(trim(p_payload ->> 'internal_note'), ''), auth.uid()
  ) returning * into v_quote;

  insert into public.lead_activities (
    organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
  ) values (
    p_organisation_id, p_lead_id, auth.uid(), 'Quote Drafted',
    v_quote.quote_number || ' version ' || v_quote.version_number || ' drafted', now(), 'Draft'
  );

  return jsonb_build_object('success', true, 'quote_id', v_quote.id, 'quote_number', v_quote.quote_number);
exception
  when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
    raise exception 'Invalid Attorney Lead quote value';
end;
$$;

create or replace function public.bridge_transition_attorney_lead_quote(
  p_organisation_id uuid,
  p_quote_id uuid,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.attorney_lead_quotes%rowtype;
  v_lead public.leads%rowtype;
  v_lead_id uuid;
  v_status text := lower(trim(coalesce(p_status, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_now timestamptz := now();
begin
  select quote.lead_id into v_lead_id
  from public.attorney_lead_quotes quote
  where quote.id = p_quote_id and quote.organisation_id = p_organisation_id;
  if not found then raise exception 'Attorney Lead quote not found'; end if;

  select lead.* into v_lead
  from public.leads lead
  where lead.lead_id = v_lead_id
    and lead.organisation_id = p_organisation_id
    and lead.lead_domain = 'attorney'
  for update;
  if not found then raise exception 'Attorney Lead not found'; end if;

  select quote.* into v_quote
  from public.attorney_lead_quotes quote
  where quote.id = p_quote_id
    and quote.organisation_id = p_organisation_id
    and quote.lead_id = v_lead_id
  for update;
  if not found then raise exception 'Attorney Lead quote not found'; end if;
  if not public.bridge_attorney_lead_can_access(
    v_lead.organisation_id, v_lead.assigned_user_id, v_lead.branch_id, 'edit'
  ) then raise exception 'Not authorised to update this Attorney Lead quote'; end if;
  if v_lead.converted_transaction_id is not null then
    raise exception 'Converted Attorney Lead quote decisions are locked';
  end if;
  if v_status not in ('sent', 'accepted', 'declined') then
    raise exception 'Invalid Attorney Lead quote decision';
  end if;
  if v_quote.status = v_status then
    return jsonb_build_object('success', true, 'unchanged', true, 'quote_id', v_quote.id, 'status', v_status);
  end if;
  if v_lead.status <> 'open' then
    raise exception 'Only open Attorney Leads can progress quotes';
  end if;
  if (v_status = 'sent' and v_quote.status <> 'draft')
     or (v_status in ('accepted', 'declined') and v_quote.status <> 'sent') then
    raise exception 'Invalid Attorney Lead quote transition';
  end if;
  if v_status = 'sent' and v_quote.valid_until < current_date then
    raise exception 'Expired Attorney Lead quote cannot be sent';
  end if;
  if v_status = 'accepted' and v_quote.valid_until < current_date then
    raise exception 'Expired Attorney Lead quote cannot be accepted';
  end if;
  if v_status = 'declined' and v_reason is null then
    raise exception 'A decline reason is required';
  end if;
  if char_length(coalesce(v_reason, '')) > 1000 then
    raise exception 'Attorney Lead quote decision reason is too long';
  end if;

  if v_status = 'sent' then
    update public.attorney_lead_quotes
    set status = 'superseded'
    where organisation_id = p_organisation_id
      and lead_id = v_quote.lead_id
      and status = 'sent'
      and id <> v_quote.id;
  end if;

  update public.attorney_lead_quotes
  set status = v_status,
      sent_at = case when v_status = 'sent' then v_now else sent_at end,
      sent_by = case when v_status = 'sent' then auth.uid() else sent_by end,
      decided_at = case when v_status in ('accepted', 'declined') then v_now else null end,
      decided_by = case when v_status in ('accepted', 'declined') then auth.uid() else null end,
      decision_reason = case when v_status in ('accepted', 'declined') then v_reason else null end
  where id = v_quote.id;

  if v_status = 'sent' then
    update public.leads
    set stage = 'quote_sent', status = 'open', last_contacted_at = coalesce(last_contacted_at, v_now), updated_at = v_now
    where lead_id = v_quote.lead_id and organisation_id = p_organisation_id;
  elsif v_status = 'accepted' then
    update public.leads
    set stage = 'won', status = 'won', closed_at = v_now, updated_at = v_now
    where lead_id = v_quote.lead_id and organisation_id = p_organisation_id;
  end if;

  insert into public.lead_activities (
    organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
  ) values (
    p_organisation_id, v_quote.lead_id, auth.uid(),
    case v_status when 'sent' then 'Quote Sent' when 'accepted' then 'Quote Accepted' else 'Quote Declined' end,
    v_quote.quote_number || ' ' || v_status || coalesce(': ' || v_reason, ''),
    v_now, initcap(v_status)
  );

  return jsonb_build_object('success', true, 'quote_id', v_quote.id, 'lead_id', v_quote.lead_id, 'status', v_status);
end;
$$;

revoke all on function public.bridge_create_attorney_lead_quote(uuid, uuid, jsonb) from public, anon;
revoke all on function public.bridge_transition_attorney_lead_quote(uuid, uuid, text, text) from public, anon;
grant execute on function public.bridge_create_attorney_lead_quote(uuid, uuid, jsonb) to authenticated;
grant execute on function public.bridge_transition_attorney_lead_quote(uuid, uuid, text, text) to authenticated;

comment on table public.attorney_lead_quotes is
  'Versioned internal Attorney Lead quote register; accepted quotes do not create Matters automatically.';

commit;
