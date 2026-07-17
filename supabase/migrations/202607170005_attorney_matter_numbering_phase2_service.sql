begin;

-- Generic firm settings share one counter across lanes. A lane-specific
-- setting receives its own counter namespace.
alter table public.attorney_matter_reference_sequences
  drop constraint if exists attorney_matter_reference_sequences_lane_check;

alter table public.attorney_matter_reference_sequences
  add constraint attorney_matter_reference_sequences_lane_check
  check (lane in ('all', 'transfer', 'bond', 'cancellation'));

comment on table public.attorney_matter_reference_sequences is
  'Atomic counters scoped to firm, numbering template lane, and numbering period. sequence_year 0 represents a continuous sequence.';

create or replace function public.assign_transaction_platform_reference()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(btrim(new.platform_reference), '') is null then
    new.platform_reference := 'A9-' || upper(replace(new.id::text, '-', ''));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_transaction_platform_reference on public.transactions;
create trigger trg_assign_transaction_platform_reference
before insert on public.transactions
for each row
execute function public.assign_transaction_platform_reference();

create or replace function public.format_attorney_matter_reference(
  p_prefix text,
  p_suffix text,
  p_separator text,
  p_include_year boolean,
  p_year_format text,
  p_sequence_value bigint,
  p_sequence_padding integer,
  p_reference_date date default current_date
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_separator text := coalesce(p_separator, '-');
  v_year text;
  v_sequence text;
  v_parts text[];
begin
  if nullif(btrim(p_prefix), '') is null then
    raise exception 'A matter-number prefix is required.' using errcode = '22023';
  end if;
  if p_sequence_value is null or p_sequence_value < 1 then
    raise exception 'A positive matter-number sequence is required.' using errcode = '22023';
  end if;
  if coalesce(p_sequence_padding, 0) not between 1 and 12 then
    raise exception 'Matter-number sequence padding must be between 1 and 12.' using errcode = '22023';
  end if;
  if coalesce(p_year_format, 'YYYY') not in ('YYYY', 'YY') then
    raise exception 'Matter-number year format must be YYYY or YY.' using errcode = '22023';
  end if;

  if coalesce(p_include_year, true) then
    v_year := case coalesce(p_year_format, 'YYYY')
      when 'YY' then to_char(coalesce(p_reference_date, current_date), 'YY')
      else to_char(coalesce(p_reference_date, current_date), 'YYYY')
    end;
  end if;

  v_sequence := p_sequence_value::text;
  if char_length(v_sequence) < p_sequence_padding then
    v_sequence := lpad(v_sequence, p_sequence_padding, '0');
  end if;

  v_parts := array[
    btrim(p_prefix),
    v_year,
    v_sequence,
    nullif(btrim(p_suffix), '')
  ];

  return array_to_string(array_remove(v_parts, null), v_separator);
end;
$$;

comment on function public.format_attorney_matter_reference(text, text, text, boolean, text, bigint, integer, date) is
  'Pure formatter for firm matter-number templates. It never reserves a sequence.';

create or replace function public.reserve_next_attorney_matter_reference(
  p_attorney_firm_id uuid,
  p_lane text,
  p_reference_date date default current_date
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_setting_lane text;
  v_prefix text;
  v_suffix text;
  v_separator text;
  v_include_year boolean;
  v_year_format text;
  v_sequence_padding integer;
  v_reset_frequency text;
  v_enabled boolean;
  v_sequence_year integer;
  v_next_value bigint;
begin
  if p_attorney_firm_id is null then
    raise exception 'Attorney firm is required.' using errcode = '22023';
  end if;
  if p_lane not in ('transfer', 'bond', 'cancellation') then
    raise exception 'Matter lane must be transfer, bond, or cancellation.' using errcode = '22023';
  end if;

  select
    setting.lane,
    setting.prefix,
    setting.suffix,
    setting.separator,
    setting.include_year,
    setting.year_format,
    setting.sequence_padding,
    setting.reset_frequency,
    setting.enabled
  into
    v_setting_lane,
    v_prefix,
    v_suffix,
    v_separator,
    v_include_year,
    v_year_format,
    v_sequence_padding,
    v_reset_frequency,
    v_enabled
  from public.attorney_matter_number_settings setting
  where setting.attorney_firm_id = p_attorney_firm_id
    and setting.lane in (p_lane, 'all')
  order by case when setting.lane = p_lane then 0 else 1 end
  limit 1;

  if not found then
    v_setting_lane := 'all';
    v_prefix := 'MAT';
    v_suffix := null;
    v_separator := '-';
    v_include_year := true;
    v_year_format := 'YYYY';
    v_sequence_padding := 6;
    v_reset_frequency := 'annual';
    v_enabled := true;
  end if;

  if not coalesce(v_enabled, true) then
    return null;
  end if;

  v_sequence_year := case v_reset_frequency
    when 'continuous' then 0
    else extract(year from coalesce(p_reference_date, current_date))::integer
  end;

  insert into public.attorney_matter_reference_sequences (
    attorney_firm_id,
    lane,
    sequence_year,
    last_value
  )
  values (
    p_attorney_firm_id,
    v_setting_lane,
    v_sequence_year,
    1
  )
  on conflict (attorney_firm_id, lane, sequence_year)
  do update
    set last_value = public.attorney_matter_reference_sequences.last_value + 1,
        updated_at = now()
  returning last_value into v_next_value;

  return public.format_attorney_matter_reference(
    v_prefix,
    v_suffix,
    v_separator,
    v_include_year,
    v_year_format,
    v_next_value,
    v_sequence_padding,
    p_reference_date
  );
end;
$$;

comment on function public.reserve_next_attorney_matter_reference(uuid, text, date) is
  'Internal atomic generator. Call ensure_attorney_matter_file rather than invoking this function directly.';

revoke all on function public.reserve_next_attorney_matter_reference(uuid, text, date) from public;
revoke all on function public.reserve_next_attorney_matter_reference(uuid, text, date) from authenticated;

create or replace function public.ensure_attorney_matter_file(
  p_transaction_id uuid,
  p_attorney_firm_id uuid,
  p_lane text,
  p_reference_date date default current_date
)
returns public.attorney_matter_files
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_file public.attorney_matter_files%rowtype;
  v_provisional_reference text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_transaction_id is null or p_attorney_firm_id is null then
    raise exception 'Transaction and attorney firm are required.' using errcode = '22023';
  end if;
  if p_lane not in ('transfer', 'bond', 'cancellation') then
    raise exception 'Matter lane must be transfer, bond, or cancellation.' using errcode = '22023';
  end if;
  if not public.attorney_user_can_manage_matter_file(p_attorney_firm_id, p_transaction_id, p_lane) then
    raise exception 'You do not have permission to create this firm matter file.' using errcode = '42501';
  end if;

  -- Serialise retries for the same transaction, firm, and lane so an
  -- idempotent retry never consumes a second sequence number.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'attorney-matter-file:' || p_transaction_id::text || ':' || p_attorney_firm_id::text || ':' || p_lane,
      0
    )
  );

  select matter_file.*
  into v_file
  from public.attorney_matter_files matter_file
  where matter_file.transaction_id = p_transaction_id
    and matter_file.attorney_firm_id = p_attorney_firm_id
    and matter_file.lane = p_lane;

  if found then
    return v_file;
  end if;

  perform 1
  from public.transactions transaction
  where transaction.id = p_transaction_id;

  if not found then
    raise exception 'Transaction not found.' using errcode = 'P0002';
  end if;

  -- Existing transactions receive their immutable Arch9 reference when the
  -- first firm matter file is opened. New transactions receive it on insert.
  update public.transactions transaction
  set platform_reference = 'A9-' || upper(replace(transaction.id::text, '-', ''))
  where transaction.id = p_transaction_id
    and transaction.platform_reference is null;

  v_provisional_reference := public.reserve_next_attorney_matter_reference(
    p_attorney_firm_id,
    p_lane,
    coalesce(p_reference_date, current_date)
  );

  insert into public.attorney_matter_files (
    transaction_id,
    attorney_firm_id,
    lane,
    provisional_reference,
    reference_status
  )
  values (
    p_transaction_id,
    p_attorney_firm_id,
    p_lane,
    v_provisional_reference,
    'provisional'
  )
  returning * into v_file;

  if v_provisional_reference is not null then
    insert into public.attorney_matter_reference_history (
      attorney_matter_file_id,
      previous_reference,
      new_reference,
      change_type,
      changed_by
    )
    values (
      v_file.id,
      null,
      v_provisional_reference,
      'generated',
      auth.uid()
    );
  end if;

  return v_file;
end;
$$;

comment on function public.ensure_attorney_matter_file(uuid, uuid, text, date) is
  'Idempotently opens a firm- and lane-specific matter file and reserves its provisional reference.';

revoke all on function public.ensure_attorney_matter_file(uuid, uuid, text, date) from public;
grant execute on function public.ensure_attorney_matter_file(uuid, uuid, text, date) to authenticated;

create or replace function public.attorney_matter_reference_is_available(
  p_attorney_firm_id uuid,
  p_reference text,
  p_exclude_matter_file_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reference text := nullif(btrim(p_reference), '');
begin
  if auth.uid() is null or not public.attorney_user_is_active_member(p_attorney_firm_id) then
    raise exception 'You do not have permission to check references for this firm.' using errcode = '42501';
  end if;
  if v_reference is null then
    return false;
  end if;

  return not exists (
    select 1
    from public.attorney_matter_files matter_file
    where matter_file.attorney_firm_id = p_attorney_firm_id
      and lower(btrim(matter_file.filing_reference)) = lower(v_reference)
      and (p_exclude_matter_file_id is null or matter_file.id <> p_exclude_matter_file_id)
  );
end;
$$;

revoke all on function public.attorney_matter_reference_is_available(uuid, text, uuid) from public;
grant execute on function public.attorney_matter_reference_is_available(uuid, text, uuid) to authenticated;

create or replace function public.set_attorney_matter_filing_reference(
  p_attorney_matter_file_id uuid,
  p_filing_reference text,
  p_change_reason text default null
)
returns public.attorney_matter_files
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_file public.attorney_matter_files%rowtype;
  v_reference text := nullif(btrim(p_filing_reference), '');
  v_previous_reference text;
  v_change_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if v_reference is null then
    raise exception 'A filing reference is required.' using errcode = '22023';
  end if;
  if char_length(v_reference) > 160 then
    raise exception 'The filing reference cannot exceed 160 characters.' using errcode = '22001';
  end if;

  select matter_file.*
  into v_file
  from public.attorney_matter_files matter_file
  where matter_file.id = p_attorney_matter_file_id
  for update;

  if not found then
    raise exception 'Attorney matter file not found.' using errcode = 'P0002';
  end if;
  if not public.attorney_user_can_manage_matter_file(
    v_file.attorney_firm_id,
    v_file.transaction_id,
    v_file.lane
  ) then
    raise exception 'You do not have permission to change this matter number.' using errcode = '42501';
  end if;

  if v_file.filing_reference is not null
    and lower(btrim(v_file.filing_reference)) = lower(v_reference) then
    return v_file;
  end if;

  if exists (
    select 1
    from public.attorney_matter_files duplicate
    where duplicate.attorney_firm_id = v_file.attorney_firm_id
      and duplicate.id <> v_file.id
      and lower(btrim(duplicate.filing_reference)) = lower(v_reference)
  ) then
    raise exception 'This filing reference is already in use by another matter in the firm.'
      using errcode = '23505';
  end if;

  v_previous_reference := coalesce(v_file.filing_reference, v_file.provisional_reference);
  v_change_type := case when v_file.reference_status = 'confirmed' then 'changed' else 'confirmed' end;

  update public.attorney_matter_files
  set filing_reference = v_reference,
      reference_status = 'confirmed',
      confirmed_at = now(),
      confirmed_by = auth.uid()
  where id = v_file.id
  returning * into v_file;

  insert into public.attorney_matter_reference_history (
    attorney_matter_file_id,
    previous_reference,
    new_reference,
    change_type,
    change_reason,
    changed_by
  )
  values (
    v_file.id,
    v_previous_reference,
    v_reference,
    v_change_type,
    nullif(btrim(p_change_reason), ''),
    auth.uid()
  );

  return v_file;
exception
  when unique_violation then
    raise exception 'This filing reference is already in use by another matter in the firm.'
      using errcode = '23505';
end;
$$;

comment on function public.set_attorney_matter_filing_reference(uuid, text, text) is
  'Confirms or changes the firm filing reference and writes an immutable history entry.';

revoke all on function public.set_attorney_matter_filing_reference(uuid, text, text) from public;
grant execute on function public.set_attorney_matter_filing_reference(uuid, text, text) to authenticated;

create or replace function public.clear_attorney_matter_filing_reference(
  p_attorney_matter_file_id uuid,
  p_change_reason text
)
returns public.attorney_matter_files
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_file public.attorney_matter_files%rowtype;
  v_previous_reference text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if nullif(btrim(p_change_reason), '') is null then
    raise exception 'A reason is required when clearing a confirmed filing reference.' using errcode = '22023';
  end if;

  select matter_file.*
  into v_file
  from public.attorney_matter_files matter_file
  where matter_file.id = p_attorney_matter_file_id
  for update;

  if not found then
    raise exception 'Attorney matter file not found.' using errcode = 'P0002';
  end if;
  if not public.attorney_user_can_manage_matter_file(
    v_file.attorney_firm_id,
    v_file.transaction_id,
    v_file.lane
  ) then
    raise exception 'You do not have permission to change this matter number.' using errcode = '42501';
  end if;
  if v_file.reference_status = 'provisional' then
    return v_file;
  end if;

  v_previous_reference := v_file.filing_reference;

  update public.attorney_matter_files
  set filing_reference = null,
      reference_status = 'provisional',
      confirmed_at = null,
      confirmed_by = null
  where id = v_file.id
  returning * into v_file;

  insert into public.attorney_matter_reference_history (
    attorney_matter_file_id,
    previous_reference,
    new_reference,
    change_type,
    change_reason,
    changed_by
  )
  values (
    v_file.id,
    v_previous_reference,
    v_file.provisional_reference,
    'cleared',
    btrim(p_change_reason),
    auth.uid()
  );

  return v_file;
end;
$$;

revoke all on function public.clear_attorney_matter_filing_reference(uuid, text) from public;
grant execute on function public.clear_attorney_matter_filing_reference(uuid, text) to authenticated;

create or replace function public.resolve_attorney_matter_reference(
  p_transaction_id uuid,
  p_attorney_firm_id uuid,
  p_lane text
)
returns table (
  attorney_matter_file_id uuid,
  platform_reference text,
  provisional_reference text,
  filing_reference text,
  effective_reference text,
  reference_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not public.attorney_user_is_active_member(p_attorney_firm_id)
    or not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'You do not have permission to view this firm matter reference.' using errcode = '42501';
  end if;
  if p_lane not in ('transfer', 'bond', 'cancellation') then
    raise exception 'Matter lane must be transfer, bond, or cancellation.' using errcode = '22023';
  end if;

  return query
  select
    matter_file.id,
    transaction.platform_reference,
    matter_file.provisional_reference,
    matter_file.filing_reference,
    coalesce(
      matter_file.filing_reference,
      matter_file.provisional_reference,
      transaction.platform_reference,
      transaction.matter_number,
      transaction.transaction_reference,
      transaction.id::text
    ),
    coalesce(matter_file.reference_status, 'provisional')
  from public.transactions transaction
  left join public.attorney_matter_files matter_file
    on matter_file.transaction_id = transaction.id
   and matter_file.attorney_firm_id = p_attorney_firm_id
   and matter_file.lane = p_lane
  where transaction.id = p_transaction_id;
end;
$$;

comment on function public.resolve_attorney_matter_reference(uuid, uuid, text) is
  'Returns the firm filing reference, provisional reference, or immutable Arch9 fallback in display priority order.';

revoke all on function public.resolve_attorney_matter_reference(uuid, uuid, text) from public;
grant execute on function public.resolve_attorney_matter_reference(uuid, uuid, text) to authenticated;

create or replace function public.prevent_attorney_matter_reference_history_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Matter reference history is immutable.' using errcode = '23514';
end;
$$;

drop trigger if exists trg_prevent_attorney_matter_reference_history_update
  on public.attorney_matter_reference_history;
create trigger trg_prevent_attorney_matter_reference_history_update
before update on public.attorney_matter_reference_history
for each row
execute function public.prevent_attorney_matter_reference_history_update();

notify pgrst, 'reload schema';

commit;
