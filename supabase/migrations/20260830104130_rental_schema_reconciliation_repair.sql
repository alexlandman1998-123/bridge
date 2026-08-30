begin;

-- The Phase 45 source migration defines this read RPC, but the live Phase 45
-- deployment omitted it. Keep the signature and access model in sync.
create or replace function public.rental_get_maintenance_queue(p_limit integer default 200)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'request_id', q.id,
        'property_id', q.property_id,
        'unit_id', q.unit_id,
        'category', q.category,
        'priority', q.priority,
        'status', q.status,
        'reported_at', q.reported_at,
        'assignee_name', q.assignee_name,
        'sla_due_at', q.sla_due_at,
        'sla_breached', q.sla_due_at < now()
          and q.assignment_status not in ('completed', 'cancelled')
      )
      order by
        case when q.sla_due_at < now() then 0 else 1 end,
        q.sla_due_at nulls last,
        q.reported_at
    ),
    '[]'::jsonb
  )
  from (
    select
      r.*,
      a.assignee_name,
      a.sla_due_at,
      a.status as assignment_status
    from public.rental_maintenance_requests r
    join public.rental_properties p on p.id = r.property_id
    left join public.rental_maintenance_assignments a on a.request_id = r.id
    where r.status not in ('resolved', 'cancelled')
      and public.rental_branch_access(p.organisation_id, p.branch_id)
    order by r.reported_at desc
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
  ) q;
$$;

revoke all on function public.rental_get_maintenance_queue(integer) from public, anon;
grant execute on function public.rental_get_maintenance_queue(integer) to authenticated;

-- These are trigger/RLS helper functions, not public RPC endpoints. Their
-- existing PUBLIC execute privilege was inherited from PostgreSQL defaults.
revoke all on function public.rental_application_final_status_guard() from public, anon;
revoke all on function public.rental_application_screening_validate_scope() from public, anon;
revoke all on function public.rental_application_validate_scope() from public, anon;
revoke all on function public.rental_branch_access(uuid, uuid) from public, anon;
revoke all on function public.rental_financial_reject_mutation() from public, anon;
revoke all on function public.rental_financial_validate_scope() from public, anon;
revoke all on function public.rental_property_scoped_record_validate() from public, anon;
revoke all on function public.rental_seed_tenancy_rent_schedule_on_activation() from public, anon;
revoke all on function public.rental_set_updated_at() from public, anon;
revoke all on function public.rental_unit_restrict_occupancy_mutation() from public, anon;
revoke all on function public.rental_unit_validate_property_scope() from public, anon;
revoke all on function public.rental_vacancy_marketing_validate_operation() from public, anon;
revoke all on function public.rental_vacancy_marketing_validate_scope() from public, anon;
revoke all on function public.rental_vacancy_validate_scope_and_transition() from public, anon;

-- RLS policies evaluate this helper as the authenticated caller.
grant execute on function public.rental_branch_access(uuid, uuid) to authenticated;

commit;
