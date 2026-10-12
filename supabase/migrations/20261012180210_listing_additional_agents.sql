begin;

alter table public.private_listings
  add column additional_agent_ids uuid[] not null default '{}';
comment on column public.private_listings.additional_agent_ids is
  'Additional portal contact agents. Does not grant listing ownership or workspace access.';

create function public.validate_private_listing_contact_agents()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare
  v_agent uuid;
  v_member jsonb;
  v_role text;
begin
  if tg_op = 'UPDATE' then
    if new.additional_agent_ids is not distinct from old.additional_agent_ids
      and new.assigned_agent_id is not distinct from old.assigned_agent_id
      and new.organisation_id is not distinct from old.organisation_id then
      return new;
    end if;
  end if;
  -- Promotion to primary removes that user from the additional contacts.
  select coalesce(array_agg(agent_id order by first_position), '{}'::uuid[])
  into new.additional_agent_ids
  from (select agent_id, min(position) first_position
    from unnest(new.additional_agent_ids) with ordinality as agents(agent_id, position)
    where agent_id is distinct from new.assigned_agent_id
    group by agent_id) contacts;
  if cardinality(new.additional_agent_ids) > 0 and new.assigned_agent_id is null then
    raise exception 'Choose a primary listing agent first' using errcode = '23514';
  end if;
  foreach v_agent in array new.additional_agent_ids loop
    select to_jsonb(member) into v_member from public.organisation_users member
      where member.organisation_id = new.organisation_id and member.user_id = v_agent;
    v_role := replace(replace(lower(coalesce(nullif(v_member->>'workspace_role',''),
      nullif(v_member->>'organisation_role',''), nullif(v_member->>'organization_role',''), v_member->>'role', '')), '-', '_'), ' ', '_');
    if v_agent is null or v_member is null
      or coalesce(nullif(v_member->>'membership_status',''), v_member->>'status', '') not in ('active','accepted','approved')
      or not (v_role in ('agent','estate_agent','sales_agent','listing_agent','owner','agency_owner','principal','agency_principal') or right(v_role,6) = '_agent') then
      raise exception 'Additional agents must be active listing agents in this agency' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.validate_private_listing_contact_agents() from public, anon, authenticated;
create trigger validate_private_listing_contact_agents
before insert or update of additional_agent_ids, assigned_agent_id, organisation_id
on public.private_listings for each row
execute function public.validate_private_listing_contact_agents();

notify pgrst, 'reload schema';
commit;
