begin;

create table if not exists public.attorney_matter_number_setting_history (
  id uuid primary key default gen_random_uuid(),
  setting_id uuid references public.attorney_matter_number_settings(id) on delete set null,
  attorney_firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  lane text not null,
  change_type text not null,
  previous_settings jsonb,
  new_settings jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint attorney_matter_number_setting_history_lane_check
    check (lane in ('all', 'transfer', 'bond', 'cancellation')),
  constraint attorney_matter_number_setting_history_change_type_check
    check (change_type in ('created', 'updated', 'deleted'))
);

create index if not exists attorney_matter_number_setting_history_firm_changed_idx
  on public.attorney_matter_number_setting_history (attorney_firm_id, changed_at desc);

comment on table public.attorney_matter_number_setting_history is
  'Immutable audit trail for firm matter-number template changes.';

create or replace function public.audit_attorney_matter_number_setting_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.attorney_matter_number_setting_history (
    setting_id,
    attorney_firm_id,
    lane,
    change_type,
    previous_settings,
    new_settings,
    changed_by
  )
  values (
    case when tg_op = 'DELETE' then null else new.id end,
    coalesce(new.attorney_firm_id, old.attorney_firm_id),
    coalesce(new.lane, old.lane),
    case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_attorney_matter_number_setting_change
  on public.attorney_matter_number_settings;
create trigger trg_audit_attorney_matter_number_setting_change
after insert or update or delete on public.attorney_matter_number_settings
for each row
execute function public.audit_attorney_matter_number_setting_change();

alter table public.attorney_matter_number_setting_history enable row level security;

drop policy if exists attorney_matter_number_setting_history_select_lead
  on public.attorney_matter_number_setting_history;
create policy attorney_matter_number_setting_history_select_lead
  on public.attorney_matter_number_setting_history
  for select
  to authenticated
  using (public.attorney_user_is_firm_lead(attorney_firm_id));

grant select on public.attorney_matter_number_setting_history to authenticated;

create or replace function public.save_attorney_matter_number_settings(
  p_attorney_firm_id uuid,
  p_settings jsonb
)
returns setof public.attorney_matter_number_settings
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_lane text;
  v_seen_lanes text[] := array[]::text[];
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_attorney_firm_id is null then
    raise exception 'Attorney firm is required.' using errcode = '22023';
  end if;
  if not public.attorney_user_is_firm_lead(p_attorney_firm_id) then
    raise exception 'Only a firm administrator or director can update matter numbering.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_settings) <> 'array' or jsonb_array_length(p_settings) < 1 then
    raise exception 'At least the firm-default numbering settings are required.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_settings)
  loop
    v_lane := lower(btrim(v_item ->> 'lane'));
    if v_lane not in ('all', 'transfer', 'bond', 'cancellation') then
      raise exception 'Unsupported matter-number settings lane: %', coalesce(v_lane, '(blank)') using errcode = '22023';
    end if;
    if v_lane = any(v_seen_lanes) then
      raise exception 'Matter-number settings contain the lane more than once: %', v_lane using errcode = '22023';
    end if;
    v_seen_lanes := array_append(v_seen_lanes, v_lane);
  end loop;

  if not ('all' = any(v_seen_lanes)) then
    raise exception 'Firm-default matter-number settings are required.' using errcode = '22023';
  end if;

  delete from public.attorney_matter_number_settings existing
  where existing.attorney_firm_id = p_attorney_firm_id
    and existing.lane <> 'all'
    and not exists (
      select 1
      from jsonb_array_elements(p_settings) submitted
      where lower(btrim(submitted ->> 'lane')) = existing.lane
    );

  for v_item in select value from jsonb_array_elements(p_settings)
  loop
    v_lane := lower(btrim(v_item ->> 'lane'));

    insert into public.attorney_matter_number_settings (
      attorney_firm_id,
      lane,
      prefix,
      suffix,
      separator,
      include_year,
      year_format,
      sequence_padding,
      reset_frequency,
      enabled,
      created_by,
      updated_by
    )
    values (
      p_attorney_firm_id,
      v_lane,
      btrim(coalesce(v_item ->> 'prefix', 'MAT')),
      nullif(btrim(v_item ->> 'suffix'), ''),
      coalesce(v_item ->> 'separator', '-'),
      coalesce((v_item ->> 'include_year')::boolean, true),
      upper(coalesce(v_item ->> 'year_format', 'YYYY')),
      coalesce((v_item ->> 'sequence_padding')::smallint, 6),
      lower(coalesce(v_item ->> 'reset_frequency', 'annual')),
      coalesce((v_item ->> 'enabled')::boolean, true),
      auth.uid(),
      auth.uid()
    )
    on conflict (attorney_firm_id, lane)
    do update
      set prefix = excluded.prefix,
          suffix = excluded.suffix,
          separator = excluded.separator,
          include_year = excluded.include_year,
          year_format = excluded.year_format,
          sequence_padding = excluded.sequence_padding,
          reset_frequency = excluded.reset_frequency,
          enabled = excluded.enabled,
          updated_by = auth.uid(),
          updated_at = now();
  end loop;

  return query
  select setting.*
  from public.attorney_matter_number_settings setting
  where setting.attorney_firm_id = p_attorney_firm_id
  order by case setting.lane
    when 'all' then 0
    when 'transfer' then 1
    when 'bond' then 2
    else 3
  end;
end;
$$;

comment on function public.save_attorney_matter_number_settings(uuid, jsonb) is
  'Atomically saves the firm default and optional lane overrides. Omitted overrides revert to the firm default.';

revoke all on function public.save_attorney_matter_number_settings(uuid, jsonb) from public;
grant execute on function public.save_attorney_matter_number_settings(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
