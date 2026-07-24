create or replace function public.bridge_update_organisation_user_profile(
  p_membership_id uuid,
  p_profile jsonb default '{}'::jsonb
)
returns public.organisation_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.organisation_users%rowtype;
  v_updated public.organisation_users%rowtype;
  v_first_name text := nullif(trim(coalesce(p_profile ->> 'firstName', '')), '');
  v_last_name text := nullif(trim(coalesce(p_profile ->> 'lastName', '')), '');
  v_full_name text := nullif(trim(coalesce(p_profile ->> 'fullName', concat_ws(' ', v_first_name, v_last_name))), '');
  v_email text := nullif(lower(trim(coalesce(p_profile ->> 'email', ''))), '');
  v_phone_number text := nullif(trim(coalesce(p_profile ->> 'phoneNumber', p_profile ->> 'phone', p_profile ->> 'mobile', '')), '');
  v_avatar_url text := nullif(trim(coalesce(p_profile ->> 'avatarUrl', '')), '');
  v_branch_id uuid := nullif(trim(coalesce(p_profile ->> 'branchId', '')), '')::uuid;
begin
  select *
  into v_target
  from public.organisation_users
  where id = p_membership_id;

  if not found then
    raise exception 'Organisation user not found.';
  end if;

  if not public.bridge_is_org_admin(v_target.organisation_id) then
    raise exception 'You do not have authority to update this organisation user profile.';
  end if;

  update public.organisation_users
  set
    first_name = case when p_profile ? 'firstName' then v_first_name else first_name end,
    last_name = case when p_profile ? 'lastName' then v_last_name else last_name end,
    email = case when p_profile ? 'email' then v_email else email end,
    branch_id = case when p_profile ? 'branchId' then v_branch_id else branch_id end,
    primary_branch_id = case when p_profile ? 'branchId' then v_branch_id else primary_branch_id end
  where id = p_membership_id
  returning *
  into v_updated;

  if v_updated.user_id is not null then
    insert into public.profiles (
      id,
      email,
      first_name,
      last_name,
      full_name,
      phone_number,
      avatar_url
    )
    values (
      v_updated.user_id,
      coalesce(v_email, v_updated.email),
      v_first_name,
      v_last_name,
      v_full_name,
      v_phone_number,
      v_avatar_url
    )
    on conflict (id) do update
    set
      email = case when p_profile ? 'email' then excluded.email else public.profiles.email end,
      first_name = case when p_profile ? 'firstName' then excluded.first_name else public.profiles.first_name end,
      last_name = case when p_profile ? 'lastName' then excluded.last_name else public.profiles.last_name end,
      full_name = case
        when p_profile ? 'fullName' or p_profile ? 'firstName' or p_profile ? 'lastName' then excluded.full_name
        else public.profiles.full_name
      end,
      phone_number = case
        when p_profile ? 'phoneNumber' or p_profile ? 'phone' or p_profile ? 'mobile' then excluded.phone_number
        else public.profiles.phone_number
      end,
      avatar_url = case when p_profile ? 'avatarUrl' then excluded.avatar_url else public.profiles.avatar_url end;
  end if;

  return v_updated;
end;
$$;

revoke all on function public.bridge_update_organisation_user_profile(uuid, jsonb) from public, anon;
grant execute on function public.bridge_update_organisation_user_profile(uuid, jsonb) to authenticated;
