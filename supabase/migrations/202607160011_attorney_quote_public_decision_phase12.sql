begin;

create unique index if not exists attorney_lead_quotes_id_org_lead_unique_idx
  on public.attorney_lead_quotes (id, organisation_id, lead_id);

create table if not exists public.attorney_lead_quote_public_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  lead_id uuid not null,
  quote_id uuid not null,
  token_hash text not null,
  status text not null default 'active',
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_quote_public_links_lead_org_fkey
    foreign key (lead_id, organisation_id)
    references public.leads(lead_id, organisation_id)
    on delete cascade,
  constraint attorney_quote_public_links_quote_org_lead_fkey
    foreign key (quote_id, organisation_id, lead_id)
    references public.attorney_lead_quotes(id, organisation_id, lead_id)
    on delete cascade,
  constraint attorney_quote_public_links_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint attorney_quote_public_links_status_check
    check (status in ('active', 'used', 'revoked')),
  constraint attorney_quote_public_links_state_check
    check (
      (status = 'active' and used_at is null and revoked_at is null)
      or (status = 'used' and used_at is not null and revoked_at is null)
      or (status = 'revoked' and revoked_at is not null and used_at is null)
    )
);

create unique index if not exists attorney_quote_public_links_token_unique_idx
  on public.attorney_lead_quote_public_links (token_hash);
create unique index if not exists attorney_quote_public_links_one_active_idx
  on public.attorney_lead_quote_public_links (organisation_id, quote_id)
  where status = 'active';
create index if not exists attorney_quote_public_links_lead_created_idx
  on public.attorney_lead_quote_public_links (organisation_id, lead_id, created_at desc);

drop trigger if exists trg_attorney_quote_public_links_updated_at on public.attorney_lead_quote_public_links;
create trigger trg_attorney_quote_public_links_updated_at
before update on public.attorney_lead_quote_public_links
for each row execute function public.bridge_touch_attorney_lead_quote();

create or replace function public.bridge_revoke_quote_links_on_terminal_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'sent' and new.status <> 'sent' then
    update public.attorney_lead_quote_public_links
    set status = 'revoked', revoked_at = now()
    where quote_id = new.id
      and organisation_id = new.organisation_id
      and status = 'active';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_attorney_quote_terminal_link_revoke on public.attorney_lead_quotes;
create trigger trg_attorney_quote_terminal_link_revoke
after update of status on public.attorney_lead_quotes
for each row execute function public.bridge_revoke_quote_links_on_terminal_state();

alter table public.attorney_lead_quote_public_links enable row level security;
drop policy if exists attorney_quote_public_links_select on public.attorney_lead_quote_public_links;
create policy attorney_quote_public_links_select
on public.attorney_lead_quote_public_links for select to authenticated
using (
  exists (
    select 1 from public.leads lead
    where lead.lead_id = attorney_lead_quote_public_links.lead_id
      and lead.organisation_id = attorney_lead_quote_public_links.organisation_id
      and lead.lead_domain = 'attorney'
      and public.bridge_attorney_lead_can_access(
        lead.organisation_id, lead.assigned_user_id, lead.branch_id, 'view'
      )
  )
);

revoke all on table public.attorney_lead_quote_public_links from public, anon, authenticated;
grant select on table public.attorney_lead_quote_public_links to authenticated;

create or replace function public.bridge_create_attorney_quote_public_link(
  p_organisation_id uuid,
  p_quote_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_lead public.leads%rowtype;
  v_quote public.attorney_lead_quotes%rowtype;
  v_link public.attorney_lead_quote_public_links%rowtype;
  v_token text;
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
  ) then raise exception 'Not authorised to share this Attorney Lead quote'; end if;
  if v_lead.status <> 'open' or v_lead.converted_transaction_id is not null then
    raise exception 'Only open unconverted Attorney Leads can share quotes';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'Only a sent Attorney Lead quote can be shared';
  end if;
  if v_quote.valid_until < current_date then
    raise exception 'Expired Attorney Lead quote cannot be shared';
  end if;

  update public.attorney_lead_quote_public_links
  set status = 'revoked', revoked_at = now()
  where organisation_id = p_organisation_id
    and quote_id = p_quote_id
    and status = 'active';

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.attorney_lead_quote_public_links (
    organisation_id, lead_id, quote_id, token_hash, expires_at, created_by
  ) values (
    p_organisation_id, v_lead_id, p_quote_id,
    encode(digest(v_token, 'sha256'), 'hex'),
    (v_quote.valid_until + 1)::timestamptz,
    auth.uid()
  ) returning * into v_link;

  insert into public.lead_activities (
    organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
  ) values (
    p_organisation_id, v_lead_id, auth.uid(), 'Quote Link Created',
    v_quote.quote_number || ' secure client link created', now(), 'Shared'
  );

  return jsonb_build_object(
    'success', true,
    'link_id', v_link.id,
    'quote_id', v_quote.id,
    'token', v_token,
    'expires_at', v_link.expires_at
  );
end;
$$;

create or replace function public.bridge_revoke_attorney_quote_public_link(
  p_organisation_id uuid,
  p_link_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_lead public.leads%rowtype;
  v_link public.attorney_lead_quote_public_links%rowtype;
  v_quote_number text;
begin
  select link.lead_id into v_lead_id
  from public.attorney_lead_quote_public_links link
  where link.id = p_link_id and link.organisation_id = p_organisation_id;
  if not found then raise exception 'Attorney quote link not found'; end if;

  select lead.* into v_lead
  from public.leads lead
  where lead.lead_id = v_lead_id
    and lead.organisation_id = p_organisation_id
    and lead.lead_domain = 'attorney'
  for update;
  if not found then raise exception 'Attorney Lead not found'; end if;

  select link.* into v_link
  from public.attorney_lead_quote_public_links link
  where link.id = p_link_id
    and link.organisation_id = p_organisation_id
    and link.lead_id = v_lead_id
  for update;
  if not found then raise exception 'Attorney quote link not found'; end if;

  if not public.bridge_attorney_lead_can_access(
    v_lead.organisation_id, v_lead.assigned_user_id, v_lead.branch_id, 'edit'
  ) then raise exception 'Not authorised to revoke this Attorney quote link'; end if;
  if v_link.status = 'revoked' then
    return jsonb_build_object('success', true, 'unchanged', true, 'link_id', v_link.id);
  end if;
  if v_link.status <> 'active' then
    raise exception 'A used Attorney quote link cannot be revoked';
  end if;

  update public.attorney_lead_quote_public_links
  set status = 'revoked', revoked_at = now()
  where id = v_link.id;

  select quote.quote_number into v_quote_number
  from public.attorney_lead_quotes quote where quote.id = v_link.quote_id;
  insert into public.lead_activities (
    organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
  ) values (
    p_organisation_id, v_lead_id, auth.uid(), 'Quote Link Revoked',
    coalesce(v_quote_number, 'Attorney quote') || ' secure client link revoked', now(), 'Revoked'
  );

  return jsonb_build_object('success', true, 'link_id', v_link.id);
end;
$$;

create or replace function public.resolve_attorney_quote_public_link(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then return null; end if;

  select jsonb_build_object(
    'state', case when link.status = 'used' then quote.status else 'active' end,
    'firm_name', firm.name,
    'logo_url', coalesce(branding.logo_url, firm.logo_url),
    'primary_colour', coalesce(branding.primary_colour, firm.primary_colour),
    'secondary_colour', coalesce(branding.secondary_colour, firm.secondary_colour),
    'contact_email', firm.email,
    'contact_phone', firm.phone,
    'client_first_name', contact.first_name,
    'service_type', detail.service_type,
    'quote_number', quote.quote_number,
    'version_number', quote.version_number,
    'currency', quote.currency,
    'professional_fee', quote.professional_fee,
    'vat_amount', quote.vat_amount,
    'disbursements', quote.disbursements,
    'total_amount', quote.total_amount,
    'valid_until', quote.valid_until,
    'decision_reason', case when link.status = 'used' then quote.decision_reason else null end
  ) into v_result
  from public.attorney_lead_quote_public_links link
  join public.attorney_lead_quotes quote
    on quote.id = link.quote_id
   and quote.organisation_id = link.organisation_id
   and quote.lead_id = link.lead_id
  join public.leads lead
    on lead.lead_id = link.lead_id
   and lead.organisation_id = link.organisation_id
   and lead.lead_domain = 'attorney'
  left join public.contacts contact
    on contact.contact_id = lead.contact_id
   and contact.organisation_id = lead.organisation_id
  left join public.attorney_lead_details detail
    on detail.lead_id = lead.lead_id
   and detail.organisation_id = lead.organisation_id
  join public.attorney_firms firm
    on firm.organisation_id = link.organisation_id
   and firm.is_active = true
  left join public.attorney_firm_branding branding on branding.firm_id = firm.id
  where link.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and (
      (link.status = 'active' and link.expires_at > now() and quote.status = 'sent' and lead.status = 'open')
      or (link.status = 'used' and quote.status in ('accepted', 'declined'))
    )
  order by firm.created_at asc
  limit 1;

  return v_result;
end;
$$;

create or replace function public.decide_attorney_quote_public_link(
  p_token text,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link_id uuid;
  v_lead_id uuid;
  v_link public.attorney_lead_quote_public_links%rowtype;
  v_lead public.leads%rowtype;
  v_quote public.attorney_lead_quotes%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_now timestamptz := now();
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid Attorney quote link'; end if;
  if v_decision not in ('accepted', 'declined') then raise exception 'Invalid Attorney quote decision'; end if;
  if v_decision = 'declined' and v_reason is null then raise exception 'A decline reason is required'; end if;
  if char_length(coalesce(v_reason, '')) > 1000 then raise exception 'Attorney quote decision reason is too long'; end if;

  select link.id, link.lead_id into v_link_id, v_lead_id
  from public.attorney_lead_quote_public_links link
  where link.token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then raise exception 'Attorney quote link unavailable'; end if;

  select lead.* into v_lead
  from public.leads lead
  where lead.lead_id = v_lead_id and lead.lead_domain = 'attorney'
  for update;
  if not found then raise exception 'Attorney quote link unavailable'; end if;

  select link.* into v_link
  from public.attorney_lead_quote_public_links link
  where link.id = v_link_id and link.lead_id = v_lead_id
  for update;
  if not found then raise exception 'Attorney quote link unavailable'; end if;

  select quote.* into v_quote
  from public.attorney_lead_quotes quote
  where quote.id = v_link.quote_id
    and quote.organisation_id = v_link.organisation_id
    and quote.lead_id = v_link.lead_id
  for update;
  if not found then raise exception 'Attorney quote link unavailable'; end if;

  if v_link.status = 'used' and v_quote.status = v_decision then
    return jsonb_build_object('success', true, 'unchanged', true, 'state', v_decision);
  end if;
  if v_link.status <> 'active' or v_link.expires_at <= v_now then
    raise exception 'Attorney quote link unavailable';
  end if;
  if v_lead.status <> 'open' or v_lead.converted_transaction_id is not null or v_quote.status <> 'sent' then
    raise exception 'Attorney quote is no longer available for decision';
  end if;
  if v_quote.valid_until < current_date then raise exception 'Attorney quote has expired'; end if;

  update public.attorney_lead_quotes
  set status = v_decision,
      decided_at = v_now,
      decided_by = null,
      decision_reason = v_reason
  where id = v_quote.id;

  update public.attorney_lead_quote_public_links
  set status = 'used', used_at = v_now, revoked_at = null
  where id = v_link.id;

  if v_decision = 'accepted' then
    update public.leads
    set stage = 'won', status = 'won', closed_at = v_now, updated_at = v_now
    where lead_id = v_lead.lead_id and organisation_id = v_lead.organisation_id;
  end if;

  insert into public.lead_activities (
    organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
  ) values (
    v_lead.organisation_id, v_lead.lead_id, null,
    case when v_decision = 'accepted' then 'Quote Accepted Publicly' else 'Quote Declined Publicly' end,
    v_quote.quote_number || ' ' || v_decision || ' through secure client link' || coalesce(': ' || v_reason, ''),
    v_now, initcap(v_decision)
  );

  return jsonb_build_object('success', true, 'state', v_decision);
end;
$$;

revoke all on function public.bridge_create_attorney_quote_public_link(uuid, uuid) from public, anon;
revoke all on function public.bridge_revoke_attorney_quote_public_link(uuid, uuid) from public, anon;
grant execute on function public.bridge_create_attorney_quote_public_link(uuid, uuid) to authenticated;
grant execute on function public.bridge_revoke_attorney_quote_public_link(uuid, uuid) to authenticated;

revoke all on function public.resolve_attorney_quote_public_link(text) from public, anon, authenticated;
revoke all on function public.decide_attorney_quote_public_link(text, text, text) from public, anon, authenticated;
grant execute on function public.resolve_attorney_quote_public_link(text) to service_role;
grant execute on function public.decide_attorney_quote_public_link(text, text, text) to service_role;

comment on table public.attorney_lead_quote_public_links is
  'Hashed, revocable bearer links for client quote decisions; raw tokens are never persisted.';

commit;
