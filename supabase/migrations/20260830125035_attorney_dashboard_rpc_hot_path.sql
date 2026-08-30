-- Firm-scoped dashboard payload.  This keeps the expensive joins and aggregate
-- calculations in Postgres and only returns a bounded working set to the UI.
-- The function is deliberately SECURITY DEFINER because an attorney firm lead
-- needs a joined dashboard view across rows whose individual RLS policies vary.
-- Access is checked before querying and execution is restricted to authenticated
-- users below.
create index if not exists transaction_attorney_assignments_dashboard_firm_updated_idx
  on public.transaction_attorney_assignments (attorney_firm_id, updated_at desc);

create or replace function public.get_attorney_dashboard_snapshot(
  p_firm_id uuid,
  p_role_view text default 'all',
  p_detail_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_limit integer := greatest(1, least(coalesce(p_detail_limit, 100), 200));
  v_role_view text := lower(trim(coalesce(p_role_view, 'all')));
  v_result jsonb;
begin
  if p_firm_id is null or v_actor_id is null then
    raise exception 'Attorney dashboard access requires an authenticated firm member.'
      using errcode = '42501';
  end if;

  select m.role
    into v_role
  from public.attorney_firm_members m
  where m.firm_id = p_firm_id
    and m.user_id = v_actor_id
    and m.status = 'active'
  limit 1;

  if v_role not in ('firm_admin', 'director_partner') then
    raise exception 'You do not have permission to view this attorney firm dashboard.'
      using errcode = '42501';
  end if;

  with assignment_rows as (
    select
      a.id,
      a.transaction_id,
      coalesce(a.attorney_role,
        case lower(coalesce(a.assignment_type, ''))
          when 'bond' then 'bond_attorney'
          when 'cancellation' then 'cancellation_attorney'
          else 'transfer_attorney'
        end
      ) as attorney_role,
      coalesce(a.assignment_status, a.status, 'active') as assignment_status,
      coalesce(a.attorney_user_id, a.primary_attorney_id) as primary_attorney_id,
      a.secretary_id,
      a.admin_handler_id,
      a.department_id,
      a.updated_at
    from public.transaction_attorney_assignments a
    where a.attorney_firm_id = p_firm_id
      and coalesce(a.assignment_status, a.status, 'active') in ('pending', 'active', 'paused')
  ),
  matter_roles as (
    select
      ar.transaction_id,
      array_agg(distinct ar.attorney_role order by ar.attorney_role) as roles,
      (array_agg(ar.primary_attorney_id order by ar.updated_at desc nulls last) filter (where ar.primary_attorney_id is not null))[1] as primary_attorney_id,
      (array_agg(ar.secretary_id order by ar.updated_at desc nulls last) filter (where ar.secretary_id is not null))[1] as secretary_id,
      (array_agg(ar.admin_handler_id order by ar.updated_at desc nulls last) filter (where ar.admin_handler_id is not null))[1] as admin_handler_id,
      (array_agg(ar.department_id order by ar.updated_at desc nulls last) filter (where ar.department_id is not null))[1] as department_id,
      max(ar.updated_at) as assignment_updated_at
    from assignment_rows ar
    group by ar.transaction_id
  ),
  matter_base as (
    select
      mr.*,
      t.id,
      t.buyer_id,
      t.matter_number,
      t.transaction_reference,
      t.stage,
      t.current_main_stage,
      t.current_sub_stage_summary,
      t.attorney_stage,
      t.next_action,
      t.risk_status,
      t.operational_state,
      t.onboarding_status,
      t.finance_type,
      t.assigned_attorney_email,
      t.property_description,
      t.property_address_line_1,
      t.property_address_line_2,
      t.suburb,
      t.city,
      t.province,
      t.seller_name,
      t.seller_email,
      t.seller_has_existing_bond,
      t.current_bond_bank,
      t.purchase_price,
      t.sales_price,
      t.bond_amount,
      t.deposit_amount,
      t.expected_transfer_date,
      t.target_registration_date,
      t.registration_date,
      t.registered_at,
      t.lifecycle_state,
      t.last_meaningful_activity_at,
      t.originating_partner_organisation_id,
      t.referral_source_organisation_id,
      t.created_at,
      t.updated_at
    from matter_roles mr
    join public.transactions t on t.id = mr.transaction_id
    where t.is_active = true
  ),
  scoped_matters as (
    select *
    from matter_base m
    where case v_role_view
      when 'transfer' then 'transfer_attorney' = any(m.roles)
      when 'bond' then 'bond_attorney' = any(m.roles)
      when 'cancellation' then 'cancellation_attorney' = any(m.roles)
      when 'shared' then cardinality(m.roles) > 1
      when 'full-service' then cardinality(m.roles) = 3
      when 'registered' then coalesce(m.registered_at, m.registration_date) is not null
        or lower(concat_ws(' ', m.stage, m.current_main_stage, m.attorney_stage)) like '%registered%'
      when 'archived' then lower(coalesce(m.lifecycle_state, '')) = 'archived'
      else true
    end
  ),
  ordered_matters as (
    select * from scoped_matters order by updated_at desc nulls last limit v_limit
  ),
  dashboard_stats as (
    select
      count(*) as active_matters,
      count(*) filter (where 'transfer_attorney' = any(roles)) as transfer_matters,
      count(*) filter (where 'bond_attorney' = any(roles)) as bond_matters,
      count(*) filter (where 'cancellation_attorney' = any(roles)) as cancellation_matters,
      count(*) filter (where created_at >= date_trunc('week', now())) as new_this_week,
      count(*) filter (where lower(concat_ws(' ', attorney_stage, next_action, stage)) like '%lodg%') as lodgements_pending,
      count(*) filter (where lower(concat_ws(' ', attorney_stage, next_action, stage)) like '%lodg%'
        and updated_at >= date_trunc('day', now())) as lodgements_today,
      count(*) filter (where coalesce(target_registration_date, expected_transfer_date, registration_date, registered_at) >= date_trunc('week', now())
        and coalesce(target_registration_date, expected_transfer_date, registration_date, registered_at) < date_trunc('week', now()) + interval '7 days') as registrations_this_week,
      count(*) filter (where lower(concat_ws(' ', stage, current_main_stage, current_sub_stage_summary, risk_status, operational_state))
        ~ '(delayed|blocked|stalled|overdue|at risk)') as delayed_matters,
      count(*) filter (where lower(concat_ws(' ', onboarding_status, attorney_stage, next_action)) like '%fica%') as awaiting_fica,
      count(*) filter (where lower(concat_ws(' ', stage, current_main_stage, attorney_stage, next_action)) ~ '(sign|otp)') as awaiting_signatures,
      count(*) filter (where lower(concat_ws(' ', attorney_stage, next_action, stage)) like '%guarantee%') as awaiting_guarantees,
      count(*) filter (where lower(concat_ws(' ', stage, current_main_stage, current_sub_stage_summary, attorney_stage, next_action))
        ~ '(clearance|rates certificate|levy certificate)') as clearance_certificates,
      count(*) filter (where lower(concat_ws(' ', stage, current_main_stage, current_sub_stage_summary, attorney_stage, next_action))
        ~ '(invoice overdue|overdue invoice|unpaid invoice|outstanding invoice)') as invoices_overdue,
      count(*) filter (where lower(concat_ws(' ', stage, current_main_stage, current_sub_stage_summary, risk_status, operational_state))
        ~ '(delayed|blocked|stalled|overdue|at risk)'
        or coalesce(last_meaningful_activity_at, updated_at, created_at) < now() - interval '14 days') as stalled_matters,
      coalesce(sum(coalesce(purchase_price, sales_price, bond_amount, 0)), 0) as revenue_pipeline_value
    from scoped_matters
  )
  select jsonb_build_object(
    'firm', (
      select jsonb_build_object('id', f.id, 'name', f.name, 'logo_url', coalesce(f.logo_url, ''),
        'primary_colour', coalesce(f.primary_colour, ''), 'secondary_colour', coalesce(f.secondary_colour, ''))
      from public.attorney_firms f where f.id = p_firm_id
    ),
    'currentUserRole', v_role,
    'currentUserProfessionalRole', v_role,
    'canViewFirmDashboard', true,
    'kpis', (select to_jsonb(s) from dashboard_stats s),
    'matters', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.updated_at desc nulls last) from ordered_matters m
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'userId', m.user_id, 'departmentId', m.department_id, 'role', m.role,
        'professionalRole', coalesce(m.professional_role, m.role), 'status', m.status,
        'fullName', coalesce(nullif(p.full_name, ''), nullif(concat_ws(' ', p.first_name, p.last_name), ''), p.email, 'Team Member')
      ) order by m.created_at)
      from public.attorney_firm_members m
      left join public.profiles p on p.id = m.user_id
      where m.firm_id = p_firm_id and m.status not in ('suspended', 'removed')
    ), '[]'::jsonb),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'departmentType', d.department_type,
        'isActive', d.is_active, 'createdAt', d.created_at) order by d.created_at)
      from public.attorney_firm_departments d where d.firm_id = p_firm_id and coalesce(d.is_active, true)
    ), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', a.appointment_id, 'transaction_id', a.transaction_id, 'appointment_type', a.appointment_type,
        'title', a.title, 'appointment_date', a.appointment_date, 'start_time', a.start_time,
        'end_time', a.end_time, 'date_time', a.date_time, 'status', a.status
      ) order by coalesce(a.date_time, a.appointment_date::timestamp, now()))
      from public.appointments a
      where a.transaction_id in (select transaction_id from scoped_matters)
        and (
          (a.date_time >= current_date and a.date_time < current_date + interval '1 day')
          or (a.date_time is null and a.appointment_date = current_date)
        )
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_attorney_dashboard_snapshot(uuid, text, integer) from public, anon;
grant execute on function public.get_attorney_dashboard_snapshot(uuid, text, integer) to authenticated;
