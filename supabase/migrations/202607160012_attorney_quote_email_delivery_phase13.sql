begin;

alter table public.attorney_lead_quote_public_links
  add column if not exists last_email_delivery_id uuid references public.communication_deliveries(id) on delete set null,
  add column if not exists last_email_status text,
  add column if not exists last_emailed_at timestamptz,
  add column if not exists email_attempt_count integer not null default 0,
  add column if not exists email_dispatch_key uuid,
  add column if not exists email_dispatch_status text,
  add column if not exists email_dispatch_started_at timestamptz;

alter table public.attorney_lead_quote_public_links
  drop constraint if exists attorney_quote_public_links_email_status_check;
alter table public.attorney_lead_quote_public_links
  add constraint attorney_quote_public_links_email_status_check
  check (last_email_status is null or last_email_status in ('sent', 'failed'));
alter table public.attorney_lead_quote_public_links
  drop constraint if exists attorney_quote_public_links_email_attempt_count_check;
alter table public.attorney_lead_quote_public_links
  add constraint attorney_quote_public_links_email_attempt_count_check
  check (email_attempt_count between 0 and 10000);
alter table public.attorney_lead_quote_public_links
  drop constraint if exists attorney_quote_public_links_dispatch_status_check;
alter table public.attorney_lead_quote_public_links
  add constraint attorney_quote_public_links_dispatch_status_check
  check (email_dispatch_status is null or email_dispatch_status in ('prepared', 'sent', 'failed'));

create index if not exists attorney_quote_public_links_delivery_idx
  on public.attorney_lead_quote_public_links (organisation_id, last_email_delivery_id)
  where last_email_delivery_id is not null;

create or replace function public.bridge_prepare_attorney_quote_email(
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
  v_link_result jsonb;
  v_link_id uuid;
  v_token text;
  v_dispatch_key uuid := gen_random_uuid();
  v_result jsonb;
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
  ) then raise exception 'Not authorised to email this Attorney Lead quote'; end if;
  if v_lead.status <> 'open' or v_lead.converted_transaction_id is not null then
    raise exception 'Only open unconverted Attorney Leads can email quotes';
  end if;
  if v_quote.status <> 'sent' or v_quote.valid_until < current_date then
    raise exception 'Only a current sent Attorney Lead quote can be emailed';
  end if;

  if exists (
    select 1 from public.attorney_lead_quote_public_links link
    where link.organisation_id = p_organisation_id
      and link.quote_id = p_quote_id
      and link.status = 'active'
      and (
        (link.email_dispatch_status = 'prepared' and link.email_dispatch_started_at > now() - interval '10 minutes')
        or (link.last_email_status = 'sent' and link.last_emailed_at > now() - interval '30 seconds')
      )
  ) then raise exception 'Attorney quote email delivery is already in progress or was just sent'; end if;

  v_link_result := public.bridge_create_attorney_quote_public_link(p_organisation_id, p_quote_id);
  v_link_id := nullif(v_link_result ->> 'link_id', '')::uuid;
  v_token := nullif(v_link_result ->> 'token', '');
  if v_link_id is null or v_token is null then
    raise exception 'Secure Attorney quote link could not be prepared';
  end if;
  update public.attorney_lead_quote_public_links
  set email_dispatch_key = v_dispatch_key,
      email_dispatch_status = 'prepared',
      email_dispatch_started_at = now()
  where id = v_link_id;

  select jsonb_build_object(
    'success', true,
    'organisation_id', lead.organisation_id,
    'branch_id', lead.branch_id,
    'lead_id', lead.lead_id,
    'quote_id', quote.id,
    'link_id', link.id,
    'dispatch_key', v_dispatch_key,
    'actor_user_id', auth.uid(),
    'token', v_token,
    'expires_at', link.expires_at,
    'recipient_email', lower(trim(contact.email)),
    'recipient_name', trim(concat_ws(' ', contact.first_name, contact.last_name)),
    'firm_name', firm.name,
    'firm_logo_url', coalesce(branding.logo_url, firm.logo_url),
    'firm_email', firm.email,
    'firm_phone', firm.phone,
    'quote_number', quote.quote_number,
    'version_number', quote.version_number,
    'currency', quote.currency,
    'professional_fee', quote.professional_fee,
    'vat_amount', quote.vat_amount,
    'disbursements', quote.disbursements,
    'total_amount', quote.total_amount,
    'valid_until', quote.valid_until,
    'service_type', detail.service_type
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
  join public.contacts contact
    on contact.contact_id = lead.contact_id
   and contact.organisation_id = lead.organisation_id
  left join public.attorney_lead_details detail
    on detail.lead_id = lead.lead_id
   and detail.organisation_id = lead.organisation_id
  join public.attorney_firms firm
    on firm.organisation_id = lead.organisation_id
   and firm.is_active = true
  left join public.attorney_firm_branding branding on branding.firm_id = firm.id
  where link.id = v_link_id
    and link.organisation_id = p_organisation_id
    and link.status = 'active'
  order by firm.created_at asc
  limit 1;

  if v_result is null then raise exception 'Attorney quote email context is unavailable'; end if;
  if coalesce(v_result ->> 'recipient_email', '') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Attorney Lead requires a valid client email address';
  end if;

  return v_result;
end;
$$;

create or replace function public.bridge_record_attorney_quote_email_delivery(
  p_organisation_id uuid,
  p_lead_id uuid,
  p_quote_id uuid,
  p_link_id uuid,
  p_dispatch_key uuid,
  p_status text,
  p_delivery_id uuid default null,
  p_provider_message_id text default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_quote_number text;
  v_error text := nullif(left(trim(coalesce(p_error_message, '')), 1000), '');
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if v_status not in ('sent', 'failed') then raise exception 'Invalid Attorney quote email delivery status'; end if;

  select quote.quote_number into v_quote_number
  from public.attorney_lead_quote_public_links link
  join public.attorney_lead_quotes quote
    on quote.id = link.quote_id
   and quote.organisation_id = link.organisation_id
   and quote.lead_id = link.lead_id
  join public.leads lead
    on lead.lead_id = link.lead_id
   and lead.organisation_id = link.organisation_id
   and lead.lead_domain = 'attorney'
  where link.id = p_link_id
    and link.organisation_id = p_organisation_id
    and link.lead_id = p_lead_id
    and link.quote_id = p_quote_id
    and link.email_dispatch_key = p_dispatch_key
    and link.email_dispatch_status = 'prepared'
  for update of link;
  if not found then raise exception 'Attorney quote email delivery context not found'; end if;

  update public.attorney_lead_quote_public_links
  set last_email_delivery_id = p_delivery_id,
      last_email_status = v_status,
      last_emailed_at = case when v_status = 'sent' then now() else last_emailed_at end,
      email_attempt_count = email_attempt_count + 1,
      email_dispatch_status = v_status,
      status = case when v_status = 'failed' and status = 'active' then 'revoked' else status end,
      revoked_at = case when v_status = 'failed' and status = 'active' then now() else revoked_at end
  where id = p_link_id;

  insert into public.lead_activities (
    organisation_id, lead_id, agent_id, activity_type, activity_note, activity_date, outcome
  ) values (
    p_organisation_id, p_lead_id, null,
    case when v_status = 'sent' then 'Quote Email Sent' else 'Quote Email Failed' end,
    v_quote_number || case when v_status = 'sent'
      then ' secure quote email sent'
      else ' secure quote email failed' || coalesce(': ' || v_error, '')
    end,
    now(), initcap(v_status)
  );

  return jsonb_build_object(
    'success', true,
    'status', v_status,
    'delivery_id', p_delivery_id,
    'provider_message_id', nullif(left(trim(coalesce(p_provider_message_id, '')), 500), '')
  );
end;
$$;

revoke all on function public.bridge_prepare_attorney_quote_email(uuid, uuid) from public, anon;
grant execute on function public.bridge_prepare_attorney_quote_email(uuid, uuid) to authenticated;
revoke all on function public.bridge_record_attorney_quote_email_delivery(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.bridge_record_attorney_quote_email_delivery(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text) to service_role;

comment on function public.bridge_prepare_attorney_quote_email(uuid, uuid) is
  'Authenticated command that resolves the stored Lead email and creates a fresh one-time quote link envelope.';

commit;
