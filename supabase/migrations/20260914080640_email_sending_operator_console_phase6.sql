begin;

-- Platform administrators approve organisations through a controlled RPC. The
-- earlier guard continues to block agency administrators from granting their
-- own sending access.
create or replace function public.email_sending_policy_protect_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare is_platform_admin boolean := coalesce(public.arch9_admin_access_level() ->> 'level', '') = 'executive';
begin
  if coalesce(auth.role(), '') <> 'service_role' and not is_platform_admin
    and tg_op = 'INSERT'
    and (new.approved_at is not null or new.approved_by is not null or new.approval_note is not null) then
    raise exception 'Only Arch9 can approve an organisation for email sending.' using errcode = '42501';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and not is_platform_admin
    and tg_op = 'UPDATE'
    and (new.approved_at, new.approved_by, new.approval_note)
      is distinct from (old.approved_at, old.approved_by, old.approval_note) then
    raise exception 'Only Arch9 can change email sending approval.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.arch9_admin_set_email_sending_policy(
  p_organisation_id uuid,
  p_approved boolean,
  p_daily_recipient_limit integer default 500,
  p_paused boolean default false,
  p_approval_note text default null
)
returns public.email_sending_policies
language plpgsql
security definer
set search_path = public
as $$
declare result public.email_sending_policies%rowtype;
begin
  if coalesce(public.arch9_admin_access_level() ->> 'level', '') <> 'executive' then
    raise exception 'Only Arch9 executive administrators can change email sending approval.' using errcode = '42501';
  end if;
  if p_organisation_id is null or p_daily_recipient_limit not between 1 and 500 then
    raise exception 'Use an organisation and a daily limit between 1 and 500.' using errcode = '22023';
  end if;
  insert into public.email_sending_policies (
    organisation_id, daily_recipient_limit, approved_at, approved_by, approval_note, paused_at, pause_reason
  ) values (
    p_organisation_id, p_daily_recipient_limit,
    case when p_approved then now() else null end,
    case when p_approved then auth.uid() else null end,
    nullif(btrim(coalesce(p_approval_note, '')), ''),
    case when p_paused then now() else null end,
    case when p_paused then 'Paused by Arch9 operator.' else null end
  ) on conflict (organisation_id) do update set
    daily_recipient_limit = excluded.daily_recipient_limit,
    approved_at = excluded.approved_at,
    approved_by = excluded.approved_by,
    approval_note = excluded.approval_note,
    paused_at = excluded.paused_at,
    pause_reason = excluded.pause_reason
  returning * into result;
  return result;
end;
$$;

revoke all on function public.arch9_admin_set_email_sending_policy(uuid, boolean, integer, boolean, text) from public, anon;
grant execute on function public.arch9_admin_set_email_sending_policy(uuid, boolean, integer, boolean, text) to authenticated, service_role;

commit;
