-- Keep settings and their managed participants in one transaction. Marketing
-- and details saves use a separate, two-column feature-switch update.
create or replace function public.bridge_save_development_settings(
  target_development_id uuid,
  settings_patch jsonb,
  default_participants jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_settings public.development_settings%rowtype;
  v_existing_count integer;
  v_changed_count integer;
  v_saved_count integer;
begin
  if auth.uid() is null or not coalesce(public.bridge_can_manage_development_record(target_development_id), false) then
    raise exception 'You do not have access to save this development.' using errcode = '42501';
  end if;
  if default_participants is null or jsonb_typeof(default_participants) <> 'array' then
    raise exception 'Default participants must be an array.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(default_participants) as p(value)
    where jsonb_typeof(p.value) <> 'object'
      or coalesce(p.value ->> 'role_type', '') not in ('agent', 'attorney', 'bond_originator', 'developer')
  ) then
    raise exception 'Invalid development default participant.' using errcode = '22023';
  end if;
  if settings_patch is not null then
    if jsonb_typeof(settings_patch) <> 'object' then
      raise exception 'Development settings must be an object.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_object_keys(settings_patch) as k(key)
      where k.key not in ('development_id', 'client_portal_enabled', 'snag_reporting_enabled', 'alteration_requests_enabled', 'service_reviews_enabled', 'reservation_deposit_enabled_by_default', 'reservation_deposit_amount', 'reservation_deposit_amount_type', 'reservation_deposit_treatment', 'reservation_deposit_payable_to', 'reservation_deposit_payment_details', 'reservation_deposit_notification_recipients', 'default_alteration_charge_treatment', 'enabled_modules', 'stakeholder_teams'))
      or (settings_patch ? 'development_id' and settings_patch ->> 'development_id' is distinct from target_development_id::text) then
      raise exception 'Invalid development settings fields.' using errcode = '22023';
    end if;
  end if;

  -- Serialize two settings/team saves for the same development, including first saves.
  perform 1 from public.developments where id = target_development_id for update;
  if not found then
    raise exception 'Development settings could not be saved: development is unavailable.' using errcode = '42501';
  end if;

  if settings_patch is not null then
    select * into v_settings from public.development_settings where development_id = target_development_id;
    -- Preserve unspecified columns on updates; use the table defaults for first saves.
    if not found then
      insert into public.development_settings(development_id) values (target_development_id)
      returning * into v_settings;
      if not found then
        raise exception 'Development settings insert could not be confirmed.' using errcode = '42501';
      end if;
    end if;
    v_settings := jsonb_populate_record(v_settings, settings_patch);
    insert into public.development_settings (
      development_id,
      client_portal_enabled,
      snag_reporting_enabled,
      alteration_requests_enabled,
      service_reviews_enabled,
      reservation_deposit_enabled_by_default,
      reservation_deposit_amount,
      reservation_deposit_amount_type,
      reservation_deposit_treatment,
      reservation_deposit_payable_to,
      reservation_deposit_payment_details,
      reservation_deposit_notification_recipients,
      default_alteration_charge_treatment,
      enabled_modules,
      stakeholder_teams
    ) values (
      target_development_id,
      v_settings.client_portal_enabled,
      v_settings.snag_reporting_enabled,
      v_settings.alteration_requests_enabled,
      v_settings.service_reviews_enabled,
      v_settings.reservation_deposit_enabled_by_default,
      v_settings.reservation_deposit_amount,
      v_settings.reservation_deposit_amount_type,
      v_settings.reservation_deposit_treatment,
      v_settings.reservation_deposit_payable_to,
      v_settings.reservation_deposit_payment_details,
      v_settings.reservation_deposit_notification_recipients,
      v_settings.default_alteration_charge_treatment,
      v_settings.enabled_modules,
      v_settings.stakeholder_teams
    ) on conflict (development_id) do update set
      client_portal_enabled = excluded.client_portal_enabled,
      snag_reporting_enabled = excluded.snag_reporting_enabled,
      alteration_requests_enabled = excluded.alteration_requests_enabled,
      service_reviews_enabled = excluded.service_reviews_enabled,
      reservation_deposit_enabled_by_default = excluded.reservation_deposit_enabled_by_default,
      reservation_deposit_amount = excluded.reservation_deposit_amount,
      reservation_deposit_amount_type = excluded.reservation_deposit_amount_type,
      reservation_deposit_treatment = excluded.reservation_deposit_treatment,
      reservation_deposit_payable_to = excluded.reservation_deposit_payable_to,
      reservation_deposit_payment_details = excluded.reservation_deposit_payment_details,
      reservation_deposit_notification_recipients = excluded.reservation_deposit_notification_recipients,
      default_alteration_charge_treatment = excluded.default_alteration_charge_treatment,
      enabled_modules = excluded.enabled_modules,
      stakeholder_teams = excluded.stakeholder_teams
    returning * into v_settings;
    if not found then
      raise exception 'Development settings update could not be confirmed.' using errcode = '42501';
    end if;
  end if;

  select count(*) into v_existing_count from public.development_participants
  where development_id = target_development_id
    and role_type in ('agent', 'attorney', 'bond_originator', 'developer')
    and assignment_source = 'development_default';
  delete from public.development_participants
  where development_id = target_development_id
    and role_type in ('agent', 'attorney', 'bond_originator', 'developer')
    and assignment_source = 'development_default';
  get diagnostics v_changed_count = row_count;
  if v_changed_count <> v_existing_count then
    raise exception 'Existing default team assignments could not be replaced.' using errcode = '42501';
  end if;

  insert into public.development_participants (
    development_id, user_id, role_type, participant_name, participant_email,
    organisation_name, is_primary, can_view, can_create_transactions, assignment_source, is_active
  )
  select target_development_id, p.user_id, p.role_type, p.participant_name, p.participant_email,
    p.organisation_name, false, true, p.role_type = 'agent', 'development_default', true
  from jsonb_to_recordset(default_participants) as p(
    user_id uuid, role_type text, participant_name text, participant_email text, organisation_name text
  );
  get diagnostics v_saved_count = row_count;
  if v_saved_count <> jsonb_array_length(default_participants) then
    raise exception 'Replacement default team assignments could not be confirmed.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'development_id', target_development_id,
    'participants_saved', v_saved_count,
    'settings', case when settings_patch is null then null else to_jsonb(v_settings) end
  );
end;
$$;

revoke all on function public.bridge_save_development_settings(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.bridge_save_development_settings(uuid, jsonb, jsonb) to authenticated;
