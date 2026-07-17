begin;

create or replace function public.get_attorney_matter_reference_index(
  p_attorney_firm_id uuid,
  p_transaction_ids uuid[] default null
)
returns table (
  attorney_matter_file_id uuid,
  transaction_id uuid,
  lane text,
  platform_reference text,
  provisional_reference text,
  filing_reference text,
  effective_reference text,
  reference_status text,
  reference_aliases text[],
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.attorney_user_is_active_member(p_attorney_firm_id) then
    raise exception 'You do not have permission to view matter references for this firm.' using errcode = '42501';
  end if;

  return query
  select
    matter_file.id,
    matter_file.transaction_id,
    matter_file.lane,
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
    ) as effective_reference,
    matter_file.reference_status,
    aliases.reference_aliases,
    matter_file.updated_at
  from public.attorney_matter_files matter_file
  join public.transactions transaction on transaction.id = matter_file.transaction_id
  left join lateral (
    select coalesce(array_agg(distinct candidate.reference_value order by candidate.reference_value), array[]::text[]) as reference_aliases
    from (
      select nullif(btrim(matter_file.provisional_reference), '') as reference_value
      union all select nullif(btrim(matter_file.filing_reference), '')
      union all select nullif(btrim(transaction.platform_reference), '')
      union all select nullif(btrim(transaction.matter_number), '')
      union all select nullif(btrim(transaction.transaction_reference), '')
      union all
      select nullif(btrim(history.previous_reference), '')
      from public.attorney_matter_reference_history history
      where history.attorney_matter_file_id = matter_file.id
      union all
      select nullif(btrim(history.new_reference), '')
      from public.attorney_matter_reference_history history
      where history.attorney_matter_file_id = matter_file.id
    ) candidate
    where candidate.reference_value is not null
  ) aliases on true
  where matter_file.attorney_firm_id = p_attorney_firm_id
    and (p_transaction_ids is null or matter_file.transaction_id = any(p_transaction_ids))
    and public.bridge_can_access_transaction_spine(matter_file.transaction_id);
end;
$$;

comment on function public.get_attorney_matter_reference_index(uuid, uuid[]) is
  'Phase 6 secure read model for effective firm references and every searchable historical alias.';

revoke all on function public.get_attorney_matter_reference_index(uuid, uuid[]) from public;
grant execute on function public.get_attorney_matter_reference_index(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
