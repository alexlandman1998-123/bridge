begin;

alter table public.partner_visibility_permissions
  drop constraint if exists partner_visibility_permissions_key_check;

alter table public.partner_visibility_permissions
  add constraint partner_visibility_permissions_key_check check (
    permission_key in (
      'can_view_principal',
      'can_view_branch_managers',
      'can_view_agents',
      'can_view_listings',
      'can_view_applications',
      'can_view_partner_performance'
    )
  );

alter table if exists public.partner_referrals
  add column if not exists relationship_id uuid references public.organisation_partners(id) on delete set null;

update public.partner_referrals pr
   set relationship_id = t.partner_relationship_id
  from public.transactions t
 where pr.transaction_id = t.id
   and pr.relationship_id is null
   and t.partner_relationship_id is not null;

create index if not exists partner_referrals_relationship_idx
  on public.partner_referrals (relationship_id, referral_status, referral_date desc);

create or replace function public.get_bond_partner_applications_phase4(p_relationship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationship public.organisation_partners%rowtype;
  v_current_organisation_id uuid;
  v_partner_organisation_id uuid;
  v_relationship_status text;
  v_can_view_applications boolean := false;
  v_applications jsonb := '[]'::jsonb;
  v_stage_distribution jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or p_relationship_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select *
    into v_relationship
    from public.organisation_partners
   where id = p_relationship_id
   limit 1;

  if not found then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select ou.organisation_id
    into v_current_organisation_id
    from public.organisation_users ou
   where ou.user_id = auth.uid()
     and coalesce(ou.status, 'active') = 'active'
     and ou.organisation_id in (v_relationship.organisation_id, v_relationship.partner_organisation_id)
   order by ou.active_workspace_selected_at desc nulls last, ou.updated_at desc nulls last
   limit 1;

  if v_current_organisation_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  v_relationship_status := coalesce(nullif(v_relationship.status, ''), nullif(v_relationship.relationship_status, ''), 'pending');

  if v_relationship_status <> 'accepted' then
    return jsonb_build_object('error_code', 'not_accepted');
  end if;

  v_partner_organisation_id := case
    when v_relationship.organisation_id = v_current_organisation_id then v_relationship.partner_organisation_id
    else v_relationship.organisation_id
  end;

  select exists (
    select 1
    from public.partner_visibility_permissions pvp
    where pvp.relationship_id = p_relationship_id
      and pvp.permission_key = 'can_view_applications'
      and pvp.is_enabled is true
  )
  into v_can_view_applications;

  if v_can_view_applications then
    with linked_application_rows as (
      select distinct on (tba.id)
        tba.id as application_id,
        tba.transaction_id,
        coalesce(nullif(tba.reference_number, ''), nullif(t.transaction_reference, ''), 'APP-' || left(tba.id::text, 8)) as application_reference,
        coalesce(nullif(t.buyer_name, ''), 'Buyer') as buyer_display_name,
        coalesce(
          nullif(t.property_description, ''),
          nullif(trim(concat_ws(', ', nullif(t.property_address_line_1, ''), nullif(t.suburb, ''), nullif(t.city, ''))), ''),
          nullif(t.transaction_reference, ''),
          'Property pending'
        ) as property_display_name,
        coalesce(nullif(t.current_sub_stage_summary, ''), nullif(t.stage, ''), nullif(t.current_main_stage, ''), 'Review') as transaction_stage,
        coalesce(nullif(tba.status, ''), 'pending') as application_status,
        coalesce(nullif(tba.assignment_status, ''), nullif(tba.status, ''), 'pending') as stage,
        case
          when nullif(tba.metadata ->> 'approval_probability', '') ~ '^[0-9]+(\.[0-9]+)?$'
            then nullif(tba.metadata ->> 'approval_probability', '')::numeric
          else null
        end as approval_probability,
        tba.created_at,
        tba.updated_at,
        consultant_profile.full_name as assigned_consultant_name,
        coalesce(nullif(agent_profile.full_name, ''), nullif(t.assigned_agent, '')) as agency_agent_name,
        coalesce(t.sales_price, t.purchase_price, t.bond_amount, 0) as application_value,
        public.bridge_can_access_assigned_bond_application(t.id) as can_open_internal
      from public.transaction_bond_applications tba
      join public.transactions t on t.id = tba.transaction_id
      left join public.profiles consultant_profile
        on consultant_profile.id = coalesce(tba.assigned_user_id, t.primary_bond_consultant_user_id)
      left join public.profiles agent_profile
        on agent_profile.id = t.assigned_agent_id
      where exists (
          select 1
          from public.partner_referrals pr
          where pr.transaction_id = t.id
            and pr.relationship_id = p_relationship_id
        )
        or t.partner_relationship_id = p_relationship_id
        or (
          t.organisation_id = v_partner_organisation_id
          and (
            tba.assigned_organisation_id = v_current_organisation_id
            or t.bond_workspace_id = v_current_organisation_id
          )
        )
        or (
          t.organisation_id = v_current_organisation_id
          and (
            tba.assigned_organisation_id = v_partner_organisation_id
            or t.bond_workspace_id = v_partner_organisation_id
          )
        )
        or (
          t.originating_partner_organisation_id = v_partner_organisation_id
          and (
            tba.assigned_organisation_id = v_current_organisation_id
            or t.bond_workspace_id = v_current_organisation_id
          )
        )
        or (
          t.referral_source_organisation_id = v_partner_organisation_id
          and (
            tba.assigned_organisation_id = v_current_organisation_id
            or t.bond_workspace_id = v_current_organisation_id
          )
        )
      order by tba.id, tba.updated_at desc nulls last
    ),
    submitted_counts as (
      select transaction_id, count(*) filter (
        where application_status in ('submitted', 'feedback_received', 'quote_received', 'additional_documents_required', 'approved', 'buyer_approved', 'declined')
      ) as bank_submitted_count
      from linked_application_rows
      group by transaction_id
    ),
    payload_rows as (
      select jsonb_build_object(
        'application_id', lar.application_id,
        'transaction_id', lar.transaction_id,
        'application_reference', lar.application_reference,
        'buyer_display_name', lar.buyer_display_name,
        'property_display_name', lar.property_display_name,
        'stage', lar.stage,
        'status', lar.application_status,
        'bank_submitted_count', coalesce(sc.bank_submitted_count, 0),
        'approval_status', lar.application_status,
        'approval_probability', lar.approval_probability,
        'created_at', lar.created_at,
        'updated_at', lar.updated_at,
        'assigned_consultant_name', coalesce(nullif(lar.assigned_consultant_name, ''), 'Unassigned'),
        'agency_agent_name', coalesce(nullif(lar.agency_agent_name, ''), 'Agency agent pending'),
        'can_open_internal', lar.can_open_internal
      ) as payload
      from linked_application_rows lar
      left join submitted_counts sc on sc.transaction_id = lar.transaction_id
    )
    select coalesce(jsonb_agg(payload order by payload->>'updated_at' desc nulls last), '[]'::jsonb)
      into v_applications
      from payload_rows;

    with linked_application_rows as (
      select distinct on (tba.id)
        coalesce(nullif(tba.assignment_status, ''), nullif(tba.status, ''), 'pending') as stage,
        coalesce(nullif(tba.status, ''), 'pending') as status
      from public.transaction_bond_applications tba
      join public.transactions t on t.id = tba.transaction_id
      where exists (
          select 1
          from public.partner_referrals pr
          where pr.transaction_id = t.id
            and pr.relationship_id = p_relationship_id
        )
        or t.partner_relationship_id = p_relationship_id
        or (
          t.organisation_id = v_partner_organisation_id
          and (
            tba.assigned_organisation_id = v_current_organisation_id
            or t.bond_workspace_id = v_current_organisation_id
          )
        )
        or (
          t.organisation_id = v_current_organisation_id
          and (
            tba.assigned_organisation_id = v_partner_organisation_id
            or t.bond_workspace_id = v_partner_organisation_id
          )
        )
        or (
          t.originating_partner_organisation_id = v_partner_organisation_id
          and (
            tba.assigned_organisation_id = v_current_organisation_id
            or t.bond_workspace_id = v_current_organisation_id
          )
        )
        or (
          t.referral_source_organisation_id = v_partner_organisation_id
          and (
            tba.assigned_organisation_id = v_current_organisation_id
            or t.bond_workspace_id = v_current_organisation_id
          )
        )
    ),
    stage_counts as (
      select
        case
          when status in ('pending') then 'documents'
          when status in ('submitted') then 'submitted'
          when status in ('feedback_received', 'quote_received', 'additional_documents_required') then 'bank_feedback'
          when status in ('approved') then 'approved'
          when status in ('buyer_approved') then 'instruction_sent'
          else 'review'
        end as stage_key,
        count(*) as count_value
      from linked_application_rows
      group by 1
    )
    select coalesce(jsonb_agg(jsonb_build_object('stage', stage_key, 'count', count_value) order by stage_key), '[]'::jsonb)
      into v_stage_distribution
      from stage_counts;
  end if;

  return jsonb_build_object(
    'relationship_id', p_relationship_id,
    'partner_organisation_id', v_partner_organisation_id,
    'permissions', jsonb_build_object('can_view_applications', v_can_view_applications),
    'applications', v_applications,
    'stage_distribution', v_stage_distribution
  );
end;
$$;

create or replace function public.get_bond_partner_performance_phase4(p_relationship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationship public.organisation_partners%rowtype;
  v_current_organisation_id uuid;
  v_partner_organisation_id uuid;
  v_relationship_status text;
  v_can_view_performance boolean := false;
  v_summary jsonb := '{}'::jsonb;
  v_stage_distribution jsonb := '[]'::jsonb;
  v_bank_mix jsonb := '[]'::jsonb;
  v_consultant_distribution jsonb := '[]'::jsonb;
  v_monthly_trend jsonb := '[]'::jsonb;
  v_top_stage_bottleneck text := 'Not enough data';
begin
  if auth.uid() is null or p_relationship_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select *
    into v_relationship
    from public.organisation_partners
   where id = p_relationship_id
   limit 1;

  if not found then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select ou.organisation_id
    into v_current_organisation_id
    from public.organisation_users ou
   where ou.user_id = auth.uid()
     and coalesce(ou.status, 'active') = 'active'
     and ou.organisation_id in (v_relationship.organisation_id, v_relationship.partner_organisation_id)
   order by ou.active_workspace_selected_at desc nulls last, ou.updated_at desc nulls last
   limit 1;

  if v_current_organisation_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  v_relationship_status := coalesce(nullif(v_relationship.status, ''), nullif(v_relationship.relationship_status, ''), 'pending');

  if v_relationship_status <> 'accepted' then
    return jsonb_build_object('error_code', 'not_accepted');
  end if;

  v_partner_organisation_id := case
    when v_relationship.organisation_id = v_current_organisation_id then v_relationship.partner_organisation_id
    else v_relationship.organisation_id
  end;

  select exists (
    select 1
    from public.partner_visibility_permissions pvp
    where pvp.relationship_id = p_relationship_id
      and pvp.permission_key = 'can_view_partner_performance'
      and pvp.is_enabled is true
  )
  into v_can_view_performance;

  if v_can_view_performance then
    with linked_applications as (
      select distinct on (tba.id)
        tba.id,
        tba.transaction_id,
        tba.status,
        tba.bank_name,
        tba.submitted_at,
        tba.feedback_received_at,
        tba.created_at,
        tba.updated_at,
        coalesce(t.sales_price, t.purchase_price, t.bond_amount, 0) as application_value,
        coalesce(nullif(tba.assignment_status, ''), nullif(tba.status, ''), 'pending') as stage,
        coalesce(nullif(p.full_name, ''), 'Unassigned') as consultant_name
      from public.transaction_bond_applications tba
      join public.transactions t on t.id = tba.transaction_id
      left join public.profiles p on p.id = coalesce(tba.assigned_user_id, t.primary_bond_consultant_user_id)
      where exists (
          select 1
          from public.partner_referrals pr
          where pr.transaction_id = t.id
            and pr.relationship_id = p_relationship_id
        )
        or t.partner_relationship_id = p_relationship_id
        or (
          t.organisation_id = v_partner_organisation_id
          and (
            tba.assigned_organisation_id = v_current_organisation_id
            or t.bond_workspace_id = v_current_organisation_id
          )
        )
        or (
          t.organisation_id = v_current_organisation_id
          and (
            tba.assigned_organisation_id = v_partner_organisation_id
            or t.bond_workspace_id = v_partner_organisation_id
          )
        )
        or (
          t.originating_partner_organisation_id = v_partner_organisation_id
          and (
            tba.assigned_organisation_id = v_current_organisation_id
            or t.bond_workspace_id = v_current_organisation_id
          )
        )
        or (
          t.referral_source_organisation_id = v_partner_organisation_id
          and (
            tba.assigned_organisation_id = v_current_organisation_id
            or t.bond_workspace_id = v_current_organisation_id
          )
        )
      order by tba.id, tba.updated_at desc nulls last
    ),
    distinct_transactions as (
      select distinct transaction_id, application_value
      from linked_applications
    ),
    summary as (
      select
        count(*) as total_applications,
        count(*) filter (where status not in ('approved', 'buyer_approved', 'declined', 'expired')) as active_applications,
        count(*) filter (where status in ('submitted', 'feedback_received', 'quote_received', 'additional_documents_required', 'approved', 'buyer_approved', 'declined')) as submitted_applications,
        count(*) filter (where status in ('approved', 'buyer_approved')) as approved_applications,
        count(*) filter (where status = 'declined') as declined_applications,
        count(*) filter (where created_at >= date_trunc('month', now())) as applications_this_month,
        count(*) filter (
          where created_at >= date_trunc('month', now()) - interval '1 month'
            and created_at < date_trunc('month', now())
        ) as applications_last_month,
        avg(extract(epoch from (coalesce(feedback_received_at, updated_at) - submitted_at)) / 86400.0)
          filter (where status in ('approved', 'buyer_approved') and submitted_at is not null) as average_approval_time
      from linked_applications
    ),
    value_summary as (
      select
        coalesce(sum(application_value), 0) as pipeline_value,
        coalesce(avg(nullif(application_value, 0)), 0) as average_application_value
      from distinct_transactions
    )
    select jsonb_build_object(
      'total_applications', coalesce(s.total_applications, 0),
      'active_applications', coalesce(s.active_applications, 0),
      'submitted_applications', coalesce(s.submitted_applications, 0),
      'approved_applications', coalesce(s.approved_applications, 0),
      'declined_applications', coalesce(s.declined_applications, 0),
      'approval_rate', case when coalesce(s.submitted_applications, 0) > 0 then round((s.approved_applications::numeric / s.submitted_applications::numeric) * 100, 2) else 0 end,
      'average_approval_time', coalesce(round(s.average_approval_time::numeric, 1), 0),
      'pipeline_value', coalesce(vs.pipeline_value, 0),
      'average_application_value', coalesce(vs.average_application_value, 0),
      'applications_this_month', coalesce(s.applications_this_month, 0),
      'applications_last_month', coalesce(s.applications_last_month, 0),
      'month_on_month_change', case
        when coalesce(s.applications_last_month, 0) = 0 and coalesce(s.applications_this_month, 0) > 0 then 100
        when coalesce(s.applications_last_month, 0) = 0 then 0
        else round(((s.applications_this_month - s.applications_last_month)::numeric / s.applications_last_month::numeric) * 100, 2)
      end
    )
      into v_summary
      from summary s cross join value_summary vs;

    with linked_applications as (
      select distinct on (tba.id)
        tba.status,
        tba.bank_name,
        coalesce(nullif(tba.assignment_status, ''), nullif(tba.status, ''), 'pending') as stage,
        coalesce(nullif(p.full_name, ''), 'Unassigned') as consultant_name,
        date_trunc('month', tba.created_at)::date as month_start
      from public.transaction_bond_applications tba
      join public.transactions t on t.id = tba.transaction_id
      left join public.profiles p on p.id = coalesce(tba.assigned_user_id, t.primary_bond_consultant_user_id)
      where exists (
          select 1
          from public.partner_referrals pr
          where pr.transaction_id = t.id
            and pr.relationship_id = p_relationship_id
        )
        or t.partner_relationship_id = p_relationship_id
        or (
          t.organisation_id = v_partner_organisation_id
          and (
            tba.assigned_organisation_id = v_current_organisation_id
            or t.bond_workspace_id = v_current_organisation_id
          )
        )
        or (
          t.organisation_id = v_current_organisation_id
          and (
            tba.assigned_organisation_id = v_partner_organisation_id
            or t.bond_workspace_id = v_partner_organisation_id
          )
        )
        or (
          t.originating_partner_organisation_id = v_partner_organisation_id
          and (
            tba.assigned_organisation_id = v_current_organisation_id
            or t.bond_workspace_id = v_current_organisation_id
          )
        )
        or (
          t.referral_source_organisation_id = v_partner_organisation_id
          and (
            tba.assigned_organisation_id = v_current_organisation_id
            or t.bond_workspace_id = v_current_organisation_id
          )
        )
    ),
    stage_counts as (
      select
        case
          when status in ('pending') then 'Documents'
          when status in ('submitted') then 'Submitted'
          when status in ('feedback_received', 'quote_received', 'additional_documents_required') then 'Bank Feedback'
          when status in ('approved') then 'Approved'
          when status in ('buyer_approved') then 'Instruction Sent'
          else 'Review'
        end as label,
        count(*) as count_value
      from linked_applications
      group by 1
    ),
    bank_counts as (
      select coalesce(nullif(bank_name, ''), 'Bank pending') as label, count(*) as count_value
      from linked_applications
      group by 1
    ),
    consultant_counts as (
      select consultant_name as label, count(*) as count_value
      from linked_applications
      group by 1
    ),
    month_counts as (
      select month_start, count(*) as count_value
      from linked_applications
      group by month_start
    )
    select
      coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count_value) order by count_value desc, label) from stage_counts), '[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count_value) order by count_value desc, label) from bank_counts), '[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count_value) order by count_value desc, label) from consultant_counts), '[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('month', month_start, 'count', count_value) order by month_start) from month_counts), '[]'::jsonb),
      coalesce((select label from stage_counts order by count_value desc, label limit 1), 'Not enough data')
      into v_stage_distribution, v_bank_mix, v_consultant_distribution, v_monthly_trend, v_top_stage_bottleneck;
  end if;

  return jsonb_build_object(
    'relationship_id', p_relationship_id,
    'partner_organisation_id', v_partner_organisation_id,
    'permissions', jsonb_build_object('can_view_partner_performance', v_can_view_performance),
    'summary', v_summary || jsonb_build_object('top_stage_bottleneck', v_top_stage_bottleneck),
    'stage_distribution', v_stage_distribution,
    'bank_mix_summary', v_bank_mix,
    'consultant_distribution', v_consultant_distribution,
    'monthly_application_trend', v_monthly_trend
  );
end;
$$;

grant execute on function public.get_bond_partner_applications_phase4(uuid) to authenticated;
grant execute on function public.get_bond_partner_performance_phase4(uuid) to authenticated;

commit;
