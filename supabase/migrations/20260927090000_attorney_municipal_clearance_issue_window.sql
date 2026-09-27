-- A municipal section 118 certificate is valid for 60 days from issue.
-- Older matter profiles may only contain a verified valid-until date, so the
-- issue-window check applies when the attorney has recorded the issue date.
create or replace function journey_private.enforce_municipal_clearance_issue_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lane text;
  v_profile jsonb;
  v_issue_text text;
  v_expiry_text text;
  v_issued date;
  v_expiry date;
begin
  if new.step_key not in ('lodgement_ready', 'lodged_at_deeds_office') or new.status <> 'completed' then
    return new;
  end if;

  select lane.process_type, matter.routing_profile_json
    into v_lane, v_profile
    from public.transaction_subprocesses lane
    join public.transactions matter on matter.id = lane.transaction_id
    where lane.id = new.subprocess_id;
  if v_lane is distinct from 'transfer' then return new; end if;

  v_issue_text := v_profile #>> '{mvpProfile,propertyConditions,clearances,municipal,issuedOn}';
  if nullif(pg_catalog.btrim(coalesce(v_issue_text, '')), '') is null then return new; end if;
  v_expiry_text := v_profile #>> '{mvpProfile,propertyConditions,clearances,municipal,validUntil}';
  if v_issue_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(v_expiry_text, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Record valid municipal clearance issue and expiry dates.' using errcode = '22023';
  end if;
  begin
    v_issued := v_issue_text::date;
    v_expiry := v_expiry_text::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Record valid municipal clearance issue and expiry dates.' using errcode = '22023';
  end;
  if v_issued > current_date or v_expiry <= current_date or v_expiry < v_issued or v_expiry > v_issued + 60 then
    raise exception 'Municipal clearance must be current and expire within 60 days of issue.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function journey_private.enforce_municipal_clearance_issue_window() from public, anon, authenticated;
drop trigger if exists trg_enforce_municipal_clearance_issue_window on public.transaction_subprocess_steps;
create trigger trg_enforce_municipal_clearance_issue_window
before insert or update of status on public.transaction_subprocess_steps
for each row execute function journey_private.enforce_municipal_clearance_issue_window();
