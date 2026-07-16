-- The Phase 4 partner-connection RPC still referenced transactions.status,
-- which is not part of the canonical transaction schema. That caused every
-- connected-partner selector to fail before preferred/default routing could run.

create or replace function public.bridge_phase4_list_partner_connections(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rows jsonb := '[]'::jsonb;
  v_recommendations jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated');
  end if;

  if not exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = p_organization_id
      and ou.user_id = v_user_id
      and coalesce(ou.membership_status, ou.status) = 'active'
  ) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.is_preferred desc, row_data.status, row_data.partner_name), '[]'::jsonb)
  into v_rows
  from (
    select
      pc.id,
      pc.source_organization_id,
      pc.target_organization_id,
      pc.relationship_type,
      pc.status,
      pc.source_preferred,
      pc.target_preferred,
      case when pc.source_organization_id = p_organization_id then pc.source_preferred else pc.target_preferred end as is_preferred,
      case when pc.source_organization_id = p_organization_id then 'outgoing' else 'incoming' end as direction,
      partner.id as partner_organization_id,
      partner.name as partner_name,
      partner.display_name as partner_display_name,
      coalesce(partner.organization_type, partner.type) as partner_organization_type,
      partner.organization_subtype as partner_organization_subtype,
      pc.created_by,
      pc.accepted_by,
      pc.created_at,
      pc.accepted_at,
      analytics.transaction_count,
      analytics.active_transaction_count,
      analytics.completed_transaction_count,
      analytics.first_transaction_date,
      analytics.last_transaction_date
    from public.partner_connections pc
    join public.organisations partner
      on partner.id = case when pc.source_organization_id = p_organization_id then pc.target_organization_id else pc.source_organization_id end
    cross join lateral (
      select
        count(distinct tx.id)::integer as transaction_count,
        count(distinct tx.id) filter (
          where lower(coalesce(tx.stage, tx.current_main_stage, '')) not in ('registered', 'completed', 'complete', 'cancelled', 'archived')
        )::integer as active_transaction_count,
        count(distinct tx.id) filter (
          where lower(coalesce(tx.stage, tx.current_main_stage, '')) in ('registered', 'completed', 'complete')
        )::integer as completed_transaction_count,
        min(tx.created_at) as first_transaction_date,
        max(tx.created_at) as last_transaction_date
      from public.transactions tx
      left join public.transaction_role_players trp on trp.transaction_id = tx.id
      where (
        tx.organisation_id in (p_organization_id, partner.id)
        and (
          trp.organisation_id in (p_organization_id, partner.id)
          or trp.partner_organisation_id in (p_organization_id, partner.id)
          or trp.assigned_organisation_id in (p_organization_id, partner.id)
          or tx.originating_partner_organisation_id in (p_organization_id, partner.id)
          or tx.referral_source_organisation_id in (p_organization_id, partner.id)
        )
      )
    ) analytics
    where (pc.source_organization_id = p_organization_id or pc.target_organization_id = p_organization_id)
      and pc.status <> 'removed'
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.connection_count desc, row_data.name), '[]'::jsonb)
  into v_recommendations
  from (
    select
      o.id,
      o.name,
      o.display_name,
      coalesce(o.organization_type, o.type) as organization_type,
      o.organization_subtype,
      count(pc.id)::integer as connection_count
    from public.organisations o
    left join public.partner_connections pc
      on (pc.source_organization_id = o.id or pc.target_organization_id = o.id)
      and pc.status = 'connected'
    where o.id <> p_organization_id
      and coalesce(o.status, 'active') = 'active'
      and coalesce(o.discovery_visibility, 'public') <> 'hidden'
      and public.bridge_phase4_can_connect(p_organization_id, o.id)
      and not exists (
        select 1
        from public.partner_connections existing
        where existing.status in ('pending', 'connected', 'blocked')
          and (
            (existing.source_organization_id = p_organization_id and existing.target_organization_id = o.id)
            or (existing.source_organization_id = o.id and existing.target_organization_id = p_organization_id)
          )
      )
    group by o.id, o.name, o.display_name, o.organization_type, o.type, o.organization_subtype
    limit 6
  ) row_data;

  return jsonb_build_object(
    'success', true,
    'connections', v_rows,
    'recommendations', v_recommendations,
    'canManage', public.bridge_phase3_can_manage_organization(p_organization_id)
  );
end;
$$;

grant execute on function public.bridge_phase4_list_partner_connections(uuid) to authenticated;
