begin;

create extension if not exists "pgcrypto";

alter table if exists public.inbound_leads
  add column if not exists agency_onboarding_token text,
  add column if not exists agency_onboarding_status text not null default 'not_started',
  add column if not exists agency_onboarding_current_step text not null default 'agency_details',
  add column if not exists agency_onboarding_form_data jsonb not null default '{}'::jsonb,
  add column if not exists agency_onboarding_contact_first_name text,
  add column if not exists agency_onboarding_contact_last_name text,
  add column if not exists agency_onboarding_contact_email text,
  add column if not exists agency_onboarding_contact_phone text,
  add column if not exists agency_onboarding_contact_position text,
  add column if not exists agency_onboarding_agreement_id text,
  add column if not exists agency_onboarding_agreement_version text,
  add column if not exists agency_onboarding_agreement_text text,
  add column if not exists agency_onboarding_agreement_snapshot_json jsonb not null default '{}'::jsonb,
  add column if not exists agency_onboarding_agreement_audit_json jsonb not null default '{}'::jsonb,
  add column if not exists agency_onboarding_link_created_at timestamptz,
  add column if not exists agency_onboarding_link_sent_at timestamptz,
  add column if not exists agency_onboarding_first_opened_at timestamptz,
  add column if not exists agency_onboarding_last_opened_at timestamptz,
  add column if not exists agency_onboarding_started_at timestamptz,
  add column if not exists agency_onboarding_submitted_at timestamptz,
  add column if not exists agency_onboarding_agreement_accepted_at timestamptz,
  add column if not exists agency_onboarding_agreement_accepted_by_name text,
  add column if not exists agency_onboarding_agreement_accepted_by_email text,
  add column if not exists agency_onboarding_approved_at timestamptz,
  add column if not exists agency_onboarding_activated_at timestamptz,
  add column if not exists agency_onboarding_cancelled_at timestamptz,
  add column if not exists agency_onboarding_expires_at timestamptz;

alter table if exists public.inbound_leads
  drop constraint if exists inbound_leads_agency_onboarding_status_check;
alter table if exists public.inbound_leads
  add constraint inbound_leads_agency_onboarding_status_check
  check (
    agency_onboarding_status in (
      'not_started',
      'sent',
      'opened',
      'in_progress',
      'submitted',
      'approved',
      'active',
      'expired',
      'cancelled'
    )
  );

alter table if exists public.inbound_leads
  drop constraint if exists inbound_leads_agency_onboarding_current_step_check;
alter table if exists public.inbound_leads
  add constraint inbound_leads_agency_onboarding_current_step_check
  check (
    agency_onboarding_current_step in (
      'agency_details',
      'principal',
      'setup',
      'agreement',
      'complete'
    )
  );

create unique index if not exists inbound_leads_agency_onboarding_token_uidx
  on public.inbound_leads (agency_onboarding_token)
  where agency_onboarding_token is not null;

create index if not exists inbound_leads_agency_onboarding_status_idx
  on public.inbound_leads (agency_onboarding_status, created_at desc);

create index if not exists inbound_leads_agency_onboarding_lead_step_idx
  on public.inbound_leads (agency_onboarding_status, agency_onboarding_current_step, updated_at desc);

alter table if exists public.inbound_lead_activities
  drop constraint if exists inbound_lead_activities_event_type_check;
alter table if exists public.inbound_lead_activities
  add constraint inbound_lead_activities_event_type_check
  check (
    event_type in (
      'created',
      'repeat_submission',
      'owner_changed',
      'status_changed',
      'note_added',
      'contact_made',
      'demo_scheduled',
      'setup_started',
      'converted_live',
      'not_proceeding',
      'manual_update',
      'agency_onboarding_created',
      'agency_onboarding_sent',
      'agency_onboarding_opened',
      'agency_onboarding_started',
      'agency_onboarding_progress_saved',
      'agency_onboarding_submitted',
      'agency_onboarding_agreement_signed',
      'agency_onboarding_approved',
      'agency_onboarding_active',
      'agency_onboarding_expired',
      'agency_onboarding_cancelled',
      'agency_onboarding_link_replaced'
    )
  );

create or replace function public.bridge_generate_agency_onboarding_token()
returns text
language sql
volatile
set search_path = public
as $$
  select lower(encode(gen_random_bytes(32), 'hex'));
$$;

create or replace function public.arch9_admin_start_agency_onboarding(
  p_lead_id uuid,
  p_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.inbound_leads%rowtype;
  v_token text;
  v_token_generated boolean := false;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_now timestamptz := now();
begin
  if not public.arch9_admin_can_access_dashboard() then
    raise exception 'Not authorised';
  end if;

  select * into v_lead
  from public.inbound_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Inbound lead not found';
  end if;

  v_token_generated := nullif(trim(v_lead.agency_onboarding_token), '') is null;
  v_token := coalesce(nullif(trim(v_lead.agency_onboarding_token), ''), public.bridge_generate_agency_onboarding_token());

  update public.inbound_leads
  set agency_onboarding_token = v_token,
      agency_onboarding_status = case
        when agency_onboarding_status in ('submitted', 'approved', 'active', 'cancelled', 'expired') then agency_onboarding_status
        else 'not_started'
      end,
      agency_onboarding_current_step = coalesce(nullif(trim(coalesce(v_patch ->> 'current_step', '')), ''), agency_onboarding_current_step, 'agency_details'),
      agency_onboarding_form_data = coalesce(agency_onboarding_form_data, '{}'::jsonb) || coalesce(v_patch -> 'form_data', '{}'::jsonb),
      agency_onboarding_contact_first_name = coalesce(nullif(trim(coalesce(v_patch ->> 'contact_first_name', v_patch ->> 'principal_first_name', '')), ''), agency_onboarding_contact_first_name),
      agency_onboarding_contact_last_name = coalesce(nullif(trim(coalesce(v_patch ->> 'contact_last_name', v_patch ->> 'principal_last_name', '')), ''), agency_onboarding_contact_last_name),
      agency_onboarding_contact_email = coalesce(nullif(trim(coalesce(v_patch ->> 'contact_email', v_patch ->> 'principal_email', '')), ''), agency_onboarding_contact_email),
      agency_onboarding_contact_phone = coalesce(nullif(trim(coalesce(v_patch ->> 'contact_phone', v_patch ->> 'principal_phone', '')), ''), agency_onboarding_contact_phone),
      agency_onboarding_contact_position = coalesce(nullif(trim(coalesce(v_patch ->> 'contact_position', v_patch ->> 'principal_position', '')), ''), agency_onboarding_contact_position),
      agency_onboarding_link_created_at = coalesce(agency_onboarding_link_created_at, v_now),
      updated_by = auth.uid()
  where id = p_lead_id
  returning * into v_lead;

  perform public.arch9_inbound_activity(
    p_lead_id,
    'agency_onboarding_created',
    'Agency onboarding link created.',
    jsonb_build_object('tokenGenerated', v_token_generated)
  );

  return to_jsonb(v_lead);
end;
$$;

revoke all on function public.arch9_admin_start_agency_onboarding(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.arch9_admin_start_agency_onboarding(uuid, jsonb) to authenticated, service_role;

create or replace function public.arch9_admin_send_agency_onboarding_link(
  p_lead_id uuid,
  p_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.inbound_leads%rowtype;
  v_token text;
  v_token_generated boolean := false;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_now timestamptz := now();
begin
  if not public.arch9_admin_can_access_dashboard() then
    raise exception 'Not authorised';
  end if;

  select * into v_lead
  from public.inbound_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Inbound lead not found';
  end if;

  v_token_generated := nullif(trim(v_lead.agency_onboarding_token), '') is null;
  v_token := coalesce(nullif(trim(v_lead.agency_onboarding_token), ''), public.bridge_generate_agency_onboarding_token());

  update public.inbound_leads
  set agency_onboarding_token = v_token,
      agency_onboarding_status = case
        when agency_onboarding_status in ('submitted', 'approved', 'active', 'cancelled', 'expired') then agency_onboarding_status
        else 'sent'
      end,
      agency_onboarding_current_step = coalesce(nullif(trim(coalesce(v_patch ->> 'current_step', '')), ''), agency_onboarding_current_step, 'agency_details'),
      agency_onboarding_form_data = coalesce(agency_onboarding_form_data, '{}'::jsonb) || coalesce(v_patch -> 'form_data', '{}'::jsonb),
      agency_onboarding_contact_first_name = coalesce(nullif(trim(coalesce(v_patch ->> 'contact_first_name', v_patch ->> 'principal_first_name', '')), ''), agency_onboarding_contact_first_name),
      agency_onboarding_contact_last_name = coalesce(nullif(trim(coalesce(v_patch ->> 'contact_last_name', v_patch ->> 'principal_last_name', '')), ''), agency_onboarding_contact_last_name),
      agency_onboarding_contact_email = coalesce(nullif(trim(coalesce(v_patch ->> 'contact_email', v_patch ->> 'principal_email', '')), ''), agency_onboarding_contact_email),
      agency_onboarding_contact_phone = coalesce(nullif(trim(coalesce(v_patch ->> 'contact_phone', v_patch ->> 'principal_phone', '')), ''), agency_onboarding_contact_phone),
      agency_onboarding_contact_position = coalesce(nullif(trim(coalesce(v_patch ->> 'contact_position', v_patch ->> 'principal_position', '')), ''), agency_onboarding_contact_position),
      agency_onboarding_link_created_at = coalesce(agency_onboarding_link_created_at, v_now),
      agency_onboarding_link_sent_at = v_now,
      updated_by = auth.uid()
  where id = p_lead_id
  returning * into v_lead;

  perform public.arch9_inbound_activity(
    p_lead_id,
    'agency_onboarding_sent',
    'Agency onboarding link sent.',
    jsonb_build_object('tokenGenerated', v_token_generated)
  );

  return to_jsonb(v_lead);
end;
$$;

revoke all on function public.arch9_admin_send_agency_onboarding_link(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.arch9_admin_send_agency_onboarding_link(uuid, jsonb) to authenticated, service_role;

create or replace function public.arch9_admin_replace_agency_onboarding_link(
  p_lead_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.inbound_leads%rowtype;
  v_token text := public.bridge_generate_agency_onboarding_token();
begin
  if not public.arch9_admin_can_access_dashboard() then
    raise exception 'Not authorised';
  end if;

  select * into v_lead
  from public.inbound_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Inbound lead not found';
  end if;

  update public.inbound_leads
  set agency_onboarding_token = v_token,
      agency_onboarding_link_created_at = now(),
      updated_by = auth.uid()
  where id = p_lead_id
  returning * into v_lead;

  perform public.arch9_inbound_activity(
    p_lead_id,
    'agency_onboarding_link_replaced',
    'Agency onboarding link replaced.',
    jsonb_build_object('linkReplacedAt', now())
  );

  return to_jsonb(v_lead);
end;
$$;

revoke all on function public.arch9_admin_replace_agency_onboarding_link(uuid) from public, anon, authenticated;
grant execute on function public.arch9_admin_replace_agency_onboarding_link(uuid) to authenticated, service_role;

create or replace function public.arch9_admin_update_agency_onboarding_status(
  p_lead_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.inbound_leads%rowtype;
  v_status text := lower(nullif(trim(coalesce(p_status, '')), ''));
begin
  if not public.arch9_admin_can_access_dashboard() then
    raise exception 'Not authorised';
  end if;

  if v_status not in ('not_started', 'sent', 'opened', 'in_progress', 'submitted', 'approved', 'active', 'expired', 'cancelled') then
    raise exception 'Invalid agency onboarding status';
  end if;

  select * into v_lead
  from public.inbound_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Inbound lead not found';
  end if;

  update public.inbound_leads
  set agency_onboarding_status = v_status,
      agency_onboarding_approved_at = case when v_status = 'approved' then coalesce(agency_onboarding_approved_at, now()) else agency_onboarding_approved_at end,
      agency_onboarding_activated_at = case when v_status = 'active' then coalesce(agency_onboarding_activated_at, now()) else agency_onboarding_activated_at end,
      agency_onboarding_cancelled_at = case when v_status = 'cancelled' then coalesce(agency_onboarding_cancelled_at, now()) else agency_onboarding_cancelled_at end,
      agency_onboarding_submitted_at = case when v_status = 'submitted' then coalesce(agency_onboarding_submitted_at, now()) else agency_onboarding_submitted_at end,
      updated_by = auth.uid()
  where id = p_lead_id
  returning * into v_lead;

  perform public.arch9_inbound_activity(
    p_lead_id,
    case
      when v_status = 'approved' then 'agency_onboarding_approved'
      when v_status = 'active' then 'agency_onboarding_active'
      when v_status = 'cancelled' then 'agency_onboarding_cancelled'
      when v_status = 'expired' then 'agency_onboarding_expired'
      when v_status = 'submitted' then 'agency_onboarding_submitted'
      else 'agency_onboarding_progress_saved'
    end,
    'Agency onboarding status updated to ' || v_status || '.',
    jsonb_build_object('status', v_status)
  );

  return to_jsonb(v_lead);
end;
$$;

revoke all on function public.arch9_admin_update_agency_onboarding_status(uuid, text) from public, anon, authenticated;
grant execute on function public.arch9_admin_update_agency_onboarding_status(uuid, text) to authenticated, service_role;

create or replace function public.arch9_agency_onboarding_public_state(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := lower(nullif(trim(coalesce(p_token, '')), ''));
  v_lead public.inbound_leads%rowtype;
  v_now timestamptz := now();
begin
  if v_token is null or char_length(v_token) < 48 then
    raise exception 'Invalid agency onboarding link';
  end if;

  select * into v_lead
  from public.inbound_leads
  where agency_onboarding_token = v_token
  limit 1
  for update;

  if not found then
    raise exception 'Invalid agency onboarding link';
  end if;

  if v_lead.agency_onboarding_status not in ('submitted', 'approved', 'active', 'cancelled', 'expired') then
    update public.inbound_leads
    set agency_onboarding_first_opened_at = coalesce(agency_onboarding_first_opened_at, v_now),
        agency_onboarding_last_opened_at = v_now,
        agency_onboarding_status = case
          when agency_onboarding_status in ('not_started', 'sent') then 'opened'
          else agency_onboarding_status
        end,
        agency_onboarding_current_step = case
          when agency_onboarding_current_step is null or agency_onboarding_current_step = '' then 'agency_details'
          else agency_onboarding_current_step
        end,
        updated_by = auth.uid()
    where id = v_lead.id
    returning * into v_lead;

    if v_lead.agency_onboarding_first_opened_at = v_now then
      perform public.arch9_inbound_activity(
        v_lead.id,
        'agency_onboarding_opened',
        'Agency onboarding link opened.',
        jsonb_build_object('token', v_token)
      );
    end if;
  end if;

  return to_jsonb(v_lead);
end;
$$;

revoke all on function public.arch9_agency_onboarding_public_state(text) from public, anon, authenticated;
grant execute on function public.arch9_agency_onboarding_public_state(text) to anon, authenticated, service_role;

create or replace function public.arch9_agency_onboarding_save(
  p_token text,
  p_payload jsonb default '{}'::jsonb,
  p_current_step text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := lower(nullif(trim(coalesce(p_token, '')), ''));
  v_lead public.inbound_leads%rowtype;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_current_step text := lower(nullif(trim(coalesce(p_current_step, v_payload ->> 'current_step', '')), ''));
  v_now timestamptz := now();
begin
  if v_token is null or char_length(v_token) < 48 then
    raise exception 'Invalid agency onboarding link';
  end if;
  if jsonb_typeof(v_payload) <> 'object' or octet_length(v_payload::text) > 65536 then
    raise exception 'Invalid agency onboarding payload';
  end if;
  if v_current_step is not null and v_current_step not in ('agency_details', 'principal', 'setup', 'agreement', 'complete') then
    raise exception 'Invalid agency onboarding step';
  end if;

  select * into v_lead
  from public.inbound_leads
  where agency_onboarding_token = v_token
  limit 1
  for update;

  if not found then
    raise exception 'Invalid agency onboarding link';
  end if;

  update public.inbound_leads
  set agency_onboarding_form_data = coalesce(agency_onboarding_form_data, '{}'::jsonb) || v_payload,
      agency_onboarding_current_step = coalesce(v_current_step, agency_onboarding_current_step, 'agency_details'),
      agency_onboarding_status = case
        when agency_onboarding_status in ('submitted', 'approved', 'active', 'cancelled', 'expired') then agency_onboarding_status
        when agency_onboarding_status = 'opened' then 'in_progress'
        else 'in_progress'
      end,
      agency_onboarding_started_at = coalesce(agency_onboarding_started_at, v_now),
      agency_onboarding_contact_first_name = coalesce(nullif(trim(coalesce(v_payload ->> 'principal_first_name', v_payload ->> 'contact_first_name', '')), ''), agency_onboarding_contact_first_name),
      agency_onboarding_contact_last_name = coalesce(nullif(trim(coalesce(v_payload ->> 'principal_last_name', v_payload ->> 'contact_last_name', '')), ''), agency_onboarding_contact_last_name),
      agency_onboarding_contact_email = coalesce(nullif(trim(coalesce(v_payload ->> 'principal_email', v_payload ->> 'contact_email', '')), ''), agency_onboarding_contact_email),
      agency_onboarding_contact_phone = coalesce(nullif(trim(coalesce(v_payload ->> 'principal_phone', v_payload ->> 'contact_phone', '')), ''), agency_onboarding_contact_phone),
      agency_onboarding_contact_position = coalesce(nullif(trim(coalesce(v_payload ->> 'principal_position', v_payload ->> 'contact_position', '')), ''), agency_onboarding_contact_position),
      updated_by = auth.uid()
  where id = v_lead.id
  returning * into v_lead;

  perform public.arch9_inbound_activity(
    v_lead.id,
    'agency_onboarding_progress_saved',
    'Agency onboarding progress saved.',
    jsonb_build_object('current_step', coalesce(v_current_step, v_lead.agency_onboarding_current_step))
  );

  return to_jsonb(v_lead);
end;
$$;

revoke all on function public.arch9_agency_onboarding_save(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.arch9_agency_onboarding_save(text, jsonb, text) to anon, authenticated, service_role;

create or replace function public.arch9_agency_onboarding_submit(
  p_token text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := lower(nullif(trim(coalesce(p_token, '')), ''));
  v_lead public.inbound_leads%rowtype;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_now timestamptz := now();
  v_agreement_id text := nullif(trim(coalesce(v_payload ->> 'agreement_id', 'arch9-agency-services-agreement')), '');
  v_agreement_version text := nullif(trim(coalesce(v_payload ->> 'agreement_version', 'v1')), '');
  v_agreement_text text := nullif(trim(coalesce(v_payload ->> 'agreement_text', '')), '');
  v_full_name text := nullif(trim(coalesce(v_payload ->> 'accepted_by_name', v_payload ->> 'full_name', '')), '');
  v_email text := lower(nullif(trim(coalesce(v_payload ->> 'accepted_by_email', v_payload ->> 'email', '')), ''));
  v_current_step text := lower(nullif(trim(coalesce(v_payload ->> 'current_step', 'complete')), ''));
begin
  if v_token is null or char_length(v_token) < 48 then
    raise exception 'Invalid agency onboarding link';
  end if;
  if jsonb_typeof(v_payload) <> 'object' or octet_length(v_payload::text) > 65536 then
    raise exception 'Invalid agency onboarding payload';
  end if;

  select * into v_lead
  from public.inbound_leads
  where agency_onboarding_token = v_token
  limit 1
  for update;

  if not found then
    raise exception 'Invalid agency onboarding link';
  end if;

  if v_lead.agency_onboarding_status in ('cancelled', 'expired', 'active') then
    raise exception 'This agency onboarding link can no longer be submitted';
  end if;

  update public.inbound_leads
  set agency_onboarding_form_data = coalesce(agency_onboarding_form_data, '{}'::jsonb) || v_payload,
      agency_onboarding_current_step = coalesce(v_current_step, 'complete'),
      agency_onboarding_status = 'submitted',
      agency_onboarding_submitted_at = coalesce(agency_onboarding_submitted_at, v_now),
      agency_onboarding_agreement_id = coalesce(v_agreement_id, agency_onboarding_agreement_id),
      agency_onboarding_agreement_version = coalesce(v_agreement_version, agency_onboarding_agreement_version),
      agency_onboarding_agreement_text = coalesce(v_agreement_text, agency_onboarding_agreement_text),
      agency_onboarding_agreement_snapshot_json = coalesce(
        v_payload -> 'agreement_snapshot',
        v_payload -> 'agreementSnapshot',
        agency_onboarding_agreement_snapshot_json
      ),
      agency_onboarding_agreement_audit_json = coalesce(agency_onboarding_agreement_audit_json, '{}'::jsonb) || coalesce(v_payload -> 'audit', '{}'::jsonb) || jsonb_build_object(
        'submittedAt', v_now,
        'userAgent', coalesce(v_payload ->> 'user_agent', v_payload ->> 'userAgent', ''),
        'timezone', coalesce(v_payload ->> 'timezone', ''),
        'referrer', coalesce(v_payload ->> 'referrer', ''),
        'ipAddress', coalesce(v_payload ->> 'ip_address', v_payload ->> 'ipAddress', '')
      ),
      agency_onboarding_agreement_accepted_at = coalesce(agency_onboarding_agreement_accepted_at, v_now),
      agency_onboarding_agreement_accepted_by_name = coalesce(v_full_name, agency_onboarding_agreement_accepted_by_name),
      agency_onboarding_agreement_accepted_by_email = coalesce(v_email, agency_onboarding_agreement_accepted_by_email),
      agency_onboarding_started_at = coalesce(agency_onboarding_started_at, v_now),
      updated_by = auth.uid()
  where id = v_lead.id
  returning * into v_lead;

  perform public.arch9_inbound_activity(
    v_lead.id,
    'agency_onboarding_agreement_signed',
    'Agency services agreement accepted.',
    jsonb_build_object('agreement_id', v_lead.agency_onboarding_agreement_id, 'agreement_version', v_lead.agency_onboarding_agreement_version)
  );

  perform public.arch9_inbound_activity(
    v_lead.id,
    'agency_onboarding_submitted',
    'Agency onboarding submitted.',
    jsonb_build_object('submitted_at', v_now)
  );

  return to_jsonb(v_lead);
end;
$$;

revoke all on function public.arch9_agency_onboarding_submit(text, jsonb) from public, anon, authenticated;
grant execute on function public.arch9_agency_onboarding_submit(text, jsonb) to anon, authenticated, service_role;

create or replace function public.arch9_admin_activate_agency_onboarding(
  p_lead_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.inbound_leads%rowtype;
  v_form jsonb;
  v_agency_name text;
  v_legal_name text;
  v_org_id uuid;
  v_now timestamptz := now();
begin
  if not public.arch9_admin_can_access_dashboard() then
    raise exception 'Not authorised';
  end if;

  select * into v_lead
  from public.inbound_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Inbound lead not found';
  end if;

  v_form := coalesce(v_lead.agency_onboarding_form_data, '{}'::jsonb);
  v_agency_name := nullif(trim(coalesce(
    v_form ->> 'agency_name',
    v_form ->> 'agencyName',
    v_lead.organisation_name,
    ''
  )), '');
  v_legal_name := nullif(trim(coalesce(
    v_form ->> 'legal_entity_name',
    v_form ->> 'legalEntityName',
    ''
  )), '');

  if v_agency_name is null then
    raise exception 'Agency name is required before activation';
  end if;

  select org.id
    into v_org_id
  from public.organisations org
  where lower(trim(coalesce(org.display_name, org.name, org.legal_name, ''))) = lower(trim(v_agency_name))
     or (
       v_legal_name is not null
       and lower(trim(coalesce(org.legal_name, org.display_name, org.name, ''))) = lower(trim(v_legal_name))
     )
  order by
    case when coalesce(org.status, 'active') = 'active' then 0 else 1 end,
    org.created_at desc
  limit 1;

  if v_org_id is null then
    insert into public.organisations (
      name,
      display_name,
      legal_name,
      type,
      status,
      settings_json,
      created_by
    ) values (
      v_agency_name,
      v_agency_name,
      v_legal_name,
      'agency',
      'active',
      jsonb_build_object(
        'agency_onboarding',
        v_form,
        'source',
        'agency_onboarding_activation'
      ),
      auth.uid()
    )
    returning id into v_org_id;
  else
    update public.organisations
    set display_name = coalesce(display_name, v_agency_name),
        legal_name = coalesce(legal_name, v_legal_name),
        status = case when status = 'archived' then status else 'active' end,
        updated_at = now()
    where id = v_org_id;
  end if;

  update public.inbound_leads
  set agency_onboarding_status = 'active',
      agency_onboarding_activated_at = coalesce(agency_onboarding_activated_at, v_now),
      converted_entity_id = coalesce(converted_entity_id, v_org_id),
      converted_at = coalesce(converted_at, v_now),
      status = case when status = 'not_proceeding' then status else 'live' end,
      updated_by = auth.uid()
  where id = p_lead_id
  returning * into v_lead;

  perform public.arch9_inbound_activity(
    p_lead_id,
    'agency_onboarding_active',
    'Agency activated.',
    jsonb_build_object('organisation_id', v_org_id)
  );

  return to_jsonb(v_lead);
end;
$$;

revoke all on function public.arch9_admin_activate_agency_onboarding(uuid) from public, anon, authenticated;
grant execute on function public.arch9_admin_activate_agency_onboarding(uuid) to authenticated, service_role;

commit;
