begin;

-- Saved audiences remain rule definitions. This first release deliberately
-- evaluates only fields that have a dependable marketing-contact projection.
alter table public.email_saved_audiences
  add column if not exists archived_at timestamptz;

create index if not exists email_saved_audiences_active_idx
  on public.email_saved_audiences (organisation_id, updated_at desc)
  where archived_at is null;

create or replace function public.email_audience_rule_matches(
  p_contact public.email_marketing_contacts,
  p_rule jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_operator text := lower(coalesce(p_rule ->> 'operator', 'in'));
  v_group_operator text := upper(coalesce(p_rule ->> 'operator', 'AND'));
  v_field text := lower(coalesce(p_rule ->> 'field', ''));
  v_values text[];
  v_value text;
  v_match boolean;
  v_child jsonb;
begin
  if jsonb_typeof(p_rule -> 'rules') = 'array' then
    v_match := case when v_group_operator = 'OR' then false else true end;
    for v_child in select value from jsonb_array_elements(p_rule -> 'rules') loop
      if v_group_operator = 'OR' then
        v_match := v_match or public.email_audience_rule_matches(p_contact, v_child);
      else
        v_match := v_match and public.email_audience_rule_matches(p_contact, v_child);
      end if;
    end loop;
    return v_match;
  end if;

  if jsonb_typeof(p_rule -> 'value') = 'array' then
    select coalesce(array_agg(lower(btrim(value))), '{}') into v_values
    from jsonb_array_elements_text(p_rule -> 'value');
  else
    v_values := array[lower(btrim(coalesce(p_rule ->> 'value', '')))];
  end if;
  v_values := array_remove(v_values, '');
  if coalesce(array_length(v_values, 1), 0) = 0 then return false; end if;

  v_value := case v_field
    when 'contact_type' then lower(coalesce(p_contact.role_type, ''))
    when 'lead_stage' then lower(coalesce(p_contact.lead_stage, ''))
    when 'assigned_agent' then coalesce(p_contact.assigned_user_id::text, '')
    when 'branch' then coalesce(p_contact.branch_id::text, '')
    when 'preferred_area' then lower(coalesce(p_contact.area, ''))
    else ''
  end;

  if v_field = 'tags' then
    v_match := exists (
      select 1 from unnest(p_contact.tags) tag where lower(tag) = any(v_values)
    );
  elsif v_operator = 'contains' then
    v_match := exists (select 1 from unnest(v_values) candidate where v_value like '%' || candidate || '%');
  else
    v_match := v_value = any(v_values);
  end if;

  if v_operator in ('is_not', 'not_in', 'is_none_of') then return not v_match; end if;
  return v_match;
end;
$$;

create or replace function public.email_audience_preview(
  p_organisation_id uuid,
  p_rules jsonb default '{}'::jsonb,
  p_limit integer default 8,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_contacts jsonb;
begin
  if p_organisation_id is null or not public.bridge_has_organisation_membership(p_organisation_id) then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;

  with matches as (
    select c.*
    from public.email_marketing_contacts c
    where c.organisation_id = p_organisation_id
      and public.email_audience_rule_matches(c, coalesce(p_rules, '{}'::jsonb))
  )
  select count(*) into v_count from matches;

  with matches as (
    select c.*
    from public.email_marketing_contacts c
    where c.organisation_id = p_organisation_id
      and public.email_audience_rule_matches(c, coalesce(p_rules, '{}'::jsonb))
    order by c.full_name nulls last, c.email
    limit greatest(1, least(coalesce(p_limit, 8), 50))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', coalesce(nullif(full_name, ''), email), 'email', email,
    'contactType', role_type, 'assignedAgentId', assigned_user_id,
    'area', area, 'leadStage', lead_stage, 'tags', tags
  )), '[]'::jsonb) into v_contacts from matches;

  return jsonb_build_object('count', coalesce(v_count, 0), 'contacts', v_contacts);
end;
$$;

revoke all on function public.email_audience_preview(uuid,jsonb,integer,integer) from public, anon;
grant execute on function public.email_audience_preview(uuid,jsonb,integer,integer) to authenticated;

commit;
