begin;

create or replace function public.bridge_reconcile_invite_commission_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(new.accepted_by_user_id, new.invitee_user_id);
  v_email text := lower(nullif(trim(coalesce(new.email, '')), ''));
  v_membership public.organisation_users%rowtype;
  v_email_profile_id uuid;
  v_linked_profile_id uuid;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status <> 'accepted' then
    return new;
  end if;

  if old.status = 'accepted'
    and old.accepted_by_user_id is not distinct from new.accepted_by_user_id
    and old.invitee_user_id is not distinct from new.invitee_user_id
    and old.updated_at is not distinct from new.updated_at
  then
    return new;
  end if;

  if new.target_workspace_id is null or v_user_id is null or v_email is null then
    return new;
  end if;

  if new.invite_type not in ('workspace_invite', 'workspace_and_transaction_invite', 'branch_invite', 'team_invite') then
    return new;
  end if;

  if to_regclass('public.organisation_user_commission_profiles') is null then
    return new;
  end if;

  select *
  into v_membership
  from public.organisation_users ou
  where ou.organisation_id = new.target_workspace_id
    and (
      ou.user_id = v_user_id
      or lower(coalesce(ou.email, '')) = v_email
    )
  order by case when ou.status = 'active' then 0 else 1 end, ou.created_at asc
  limit 1;

  if v_membership.id is null then
    return new;
  end if;

  select id
  into v_email_profile_id
  from public.organisation_user_commission_profiles
  where organisation_id = new.target_workspace_id
    and is_active = true
    and lower(coalesce(email_address, '')) = v_email
  order by created_at desc
  limit 1;

  if v_email_profile_id is null then
    return new;
  end if;

  select id
  into v_linked_profile_id
  from public.organisation_user_commission_profiles
  where organisation_id = new.target_workspace_id
    and is_active = true
    and id <> v_email_profile_id
    and (
      organisation_user_id = v_membership.id
      or user_id = v_user_id
    )
  order by created_at desc
  limit 1;

  if v_linked_profile_id is not null then
    update public.organisation_user_commission_profiles
    set is_active = false,
        updated_at = now()
    where id = v_email_profile_id
      and organisation_user_id is null
      and user_id is null;

    perform public.bridge_record_invite_event(
      new.id,
      'commission_profile_email_duplicate_deactivated',
      v_user_id,
      jsonb_build_object(
        'membership_id', v_membership.id,
        'linked_profile_id', v_linked_profile_id,
        'email_profile_id', v_email_profile_id
      )
    );

    return new;
  end if;

  update public.organisation_user_commission_profiles
  set organisation_user_id = coalesce(organisation_user_id, v_membership.id),
      user_id = coalesce(user_id, v_user_id),
      email_address = coalesce(nullif(email_address, ''), v_email),
      updated_at = now()
  where id = v_email_profile_id
    and (organisation_user_id is null or organisation_user_id = v_membership.id)
    and (user_id is null or user_id = v_user_id);

  if found then
    perform public.bridge_record_invite_event(
      new.id,
      'commission_profile_linked_from_invite',
      v_user_id,
      jsonb_build_object(
        'membership_id', v_membership.id,
        'commission_profile_id', v_email_profile_id
      )
    );
  else
    perform public.bridge_record_invite_event(
      new.id,
      'commission_profile_link_conflict',
      v_user_id,
      jsonb_build_object(
        'membership_id', v_membership.id,
        'commission_profile_id', v_email_profile_id
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists invites_reconcile_commission_profile on public.invites;
create trigger invites_reconcile_commission_profile
after update of status, accepted_by_user_id, invitee_user_id
on public.invites
for each row
execute function public.bridge_reconcile_invite_commission_profile();

do $$
begin
  if to_regclass('public.organisation_user_commission_profiles') is not null then
    update public.invites
    set status = status,
        updated_at = now()
    where status = 'accepted'
      and target_workspace_id is not null
      and invite_type in ('workspace_invite', 'workspace_and_transaction_invite', 'branch_invite', 'team_invite')
      and coalesce(trim(email), '') <> ''
      and exists (
        select 1
        from public.organisation_user_commission_profiles cp
        where cp.organisation_id = invites.target_workspace_id
          and cp.is_active = true
          and lower(coalesce(cp.email_address, '')) = lower(invites.email)
          and (cp.organisation_user_id is null or cp.user_id is null)
      );
  end if;
end;
$$;

commit;
