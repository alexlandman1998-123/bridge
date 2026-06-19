create or replace function public.arch9_admin_invited_users_summary(
  p_start timestamptz default (now() - interval '30 days'),
  p_end timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_claim_role text := lower(coalesce(
    auth.jwt()->'app_metadata'->>'role',
    auth.jwt()->'user_metadata'->>'role',
    ''
  ));
  v_profile_role text;
  v_start timestamptz := coalesce(p_start, now() - interval '30 days');
  v_end timestamptz := coalesce(p_end, now());
  v_previous_start timestamptz;
begin
  if v_user_id is null then
    raise exception 'Admin access is required.';
  end if;

  select lower(coalesce(p.system_role, p.role, ''))
    into v_profile_role
  from public.profiles p
  where p.id = v_user_id;

  if coalesce(v_claim_role, '') not in (
      'executive',
      'executive_level',
      'founder',
      'super_admin',
      'platform_admin',
      'internal_admin',
      'developer',
      'hq_staff',
      'admin'
    )
    and coalesce(v_profile_role, '') not in (
      'executive',
      'executive_level',
      'founder',
      'super_admin',
      'platform_admin',
      'internal_admin',
      'developer',
      'hq_staff',
      'admin'
    ) then
    raise exception 'Admin access is required.';
  end if;

  if v_start > v_end then
    v_start := v_end - interval '30 days';
  end if;

  v_previous_start := v_start - (v_end - v_start);

  return (
    with invite_rows as (
      select
        coalesce(nullif(lower(trim(email)), ''), invitee_user_id::text, id::text) as identity,
        coalesce(nullif(target_workspace_role, ''), nullif(target_transaction_role, ''), nullif(invite_type, ''), 'invited_user') as role_label,
        created_at as invited_at
      from public.invites

      union all

      select
        coalesce(nullif(user_id::text, ''), id::text) as identity,
        coalesce(nullif(workspace_role, ''), nullif(organisation_role, ''), nullif(role, ''), nullif(app_role, ''), 'invited_user') as role_label,
        invited_at
      from public.organisation_users
      where invited_at is not null
        or lower(coalesce(status, '')) in ('invited', 'pending', 'pending_invitation')

      union all

      select
        coalesce(nullif(lower(trim(recipient_email)), ''), id::text) as identity,
        coalesce(nullif(relationship_type, ''), 'partner') as role_label,
        created_at as invited_at
      from public.partner_invitations

      union all

      select
        coalesce(nullif(lower(trim(email)), ''), accepted_user_id::text, id::text) as identity,
        coalesce(nullif(role_type, ''), 'transaction_partner') as role_label,
        created_at as invited_at
      from public.transaction_partner_invitations

      union all

      select
        coalesce(nullif(lower(trim(invited_email)), ''), id::text) as identity,
        'bond_partner' as role_label,
        coalesce(sent_at, created_at) as invited_at
      from public.bond_partner_invitations

      union all

      select
        coalesce(nullif(lower(trim(email)), ''), id::text) as identity,
        coalesce(nullif(role, ''), 'attorney') as role_label,
        created_at as invited_at
      from public.attorney_firm_invitations
    ),
    deduped as (
      select distinct on (identity)
        identity,
        role_label,
        invited_at
      from invite_rows
      where identity is not null
      order by identity, invited_at desc nulls last
    ),
    current_rows as (
      select *
      from deduped
      where invited_at >= v_start
        and invited_at <= v_end
    ),
    role_counts as (
      select
        initcap(replace(role_label, '_', ' ')) as label,
        count(*)::int as value
      from current_rows
      group by role_label
      order by count(*) desc, role_label asc
      limit 4
    )
    select jsonb_build_object(
      'total', coalesce((select count(*)::int from deduped), 0),
      'current', coalesce((select count(*)::int from current_rows), 0),
      'previous', coalesce((
        select count(*)::int
        from deduped
        where invited_at >= v_previous_start
          and invited_at < v_start
      ), 0),
      'roles', coalesce((
        select jsonb_agg(jsonb_build_object('label', label, 'value', value))
        from role_counts
      ), '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function public.arch9_admin_invited_users_summary(timestamptz, timestamptz) to authenticated;
