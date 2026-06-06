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
      'can_view_partner_performance',
      'can_create_finance_campaigns',
      'can_view_campaigns',
      'can_generate_finance_assets',
      'can_view_listing_opportunities',
      'can_view_attribution',
      'can_view_partner_revenue'
    )
  );

alter table if exists public.partner_campaign_links
  add column if not exists tracking_code text,
  add column if not exists source text,
  add column if not exists medium text,
  add column if not exists campaign text;

create table if not exists public.attribution_events (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.organisation_partners(id) on delete cascade,
  campaign_id uuid references public.partner_campaigns(id) on delete set null,
  listing_id uuid references public.private_listings(id) on delete set null,
  application_id uuid references public.transaction_bond_applications(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  lead_id uuid references public.leads(lead_id) on delete set null,
  event_type text not null,
  event_value numeric,
  created_at timestamptz not null default now(),
  constraint attribution_events_type_check check (
    event_type in (
      'listing_view',
      'finance_cta_click',
      'preapproval_started',
      'preapproval_completed',
      'application_created',
      'application_submitted',
      'application_approved',
      'application_declined',
      'transaction_registered'
    )
  )
);

create index if not exists attribution_events_relationship_idx
  on public.attribution_events (relationship_id, created_at desc);

create index if not exists attribution_events_campaign_idx
  on public.attribution_events (campaign_id, created_at desc)
  where campaign_id is not null;

create index if not exists attribution_events_listing_idx
  on public.attribution_events (listing_id, created_at desc)
  where listing_id is not null;

create index if not exists attribution_events_application_idx
  on public.attribution_events (application_id, created_at desc)
  where application_id is not null;

create index if not exists attribution_events_transaction_idx
  on public.attribution_events (transaction_id, created_at desc)
  where transaction_id is not null;

create table if not exists public.application_attribution (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.transaction_bond_applications(id) on delete cascade,
  relationship_id uuid not null references public.organisation_partners(id) on delete cascade,
  campaign_id uuid references public.partner_campaigns(id) on delete set null,
  listing_id uuid references public.private_listings(id) on delete set null,
  attributed_at timestamptz not null default now(),
  constraint application_attribution_application_unique unique (application_id)
);

create index if not exists application_attribution_relationship_idx
  on public.application_attribution (relationship_id, attributed_at desc);

create index if not exists application_attribution_campaign_idx
  on public.application_attribution (campaign_id)
  where campaign_id is not null;

create index if not exists application_attribution_listing_idx
  on public.application_attribution (listing_id)
  where listing_id is not null;

create table if not exists public.partner_revenue_attribution (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.organisation_partners(id) on delete cascade,
  application_id uuid references public.transaction_bond_applications(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  attributed_revenue numeric(14, 2) not null default 0,
  revenue_type text not null default 'bond',
  created_at timestamptz not null default now(),
  constraint partner_revenue_attribution_type_check check (
    revenue_type in ('bond', 'transfer', 'cancellation', 'crm', 'campaign')
  )
);

create index if not exists partner_revenue_attribution_relationship_idx
  on public.partner_revenue_attribution (relationship_id, created_at desc);

create index if not exists partner_revenue_attribution_application_idx
  on public.partner_revenue_attribution (application_id)
  where application_id is not null;

create index if not exists partner_revenue_attribution_transaction_idx
  on public.partner_revenue_attribution (transaction_id)
  where transaction_id is not null;

create unique index if not exists partner_revenue_attribution_application_type_unique
  on public.partner_revenue_attribution (relationship_id, application_id, revenue_type)
  where application_id is not null;

alter table public.attribution_events enable row level security;
alter table public.application_attribution enable row level security;
alter table public.partner_revenue_attribution enable row level security;

drop policy if exists attribution_events_select_related_orgs on public.attribution_events;
create policy attribution_events_select_related_orgs
on public.attribution_events
for select to authenticated
using (
  exists (
    select 1
    from public.organisation_partners op
    where op.id = attribution_events.relationship_id
      and (
        public.bridge_is_active_member(op.organisation_id)
        or public.bridge_is_active_member(op.partner_organisation_id)
      )
  )
);

drop policy if exists attribution_events_insert_related_orgs on public.attribution_events;
create policy attribution_events_insert_related_orgs
on public.attribution_events
for insert to authenticated
with check (
  exists (
    select 1
    from public.organisation_partners op
    where op.id = attribution_events.relationship_id
      and (
        public.bridge_is_active_member(op.organisation_id)
        or public.bridge_is_active_member(op.partner_organisation_id)
      )
  )
);

drop policy if exists application_attribution_select_related_orgs on public.application_attribution;
create policy application_attribution_select_related_orgs
on public.application_attribution
for select to authenticated
using (
  exists (
    select 1
    from public.organisation_partners op
    where op.id = application_attribution.relationship_id
      and (
        public.bridge_is_active_member(op.organisation_id)
        or public.bridge_is_active_member(op.partner_organisation_id)
      )
  )
);

drop policy if exists partner_revenue_attribution_select_related_orgs on public.partner_revenue_attribution;
create policy partner_revenue_attribution_select_related_orgs
on public.partner_revenue_attribution
for select to authenticated
using (
  exists (
    select 1
    from public.organisation_partners op
    where op.id = partner_revenue_attribution.relationship_id
      and (
        public.bridge_is_active_member(op.organisation_id)
        or public.bridge_is_active_member(op.partner_organisation_id)
      )
  )
);

create or replace function public.bridge_validate_partner_attribution_phase6(p_relationship_id uuid)
returns table (
  relationship_id uuid,
  current_organisation_id uuid,
  partner_organisation_id uuid,
  can_view_attribution boolean,
  can_view_partner_revenue boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationship public.organisation_partners%rowtype;
  v_current_organisation_id uuid;
  v_relationship_status text;
begin
  if auth.uid() is null or p_relationship_id is null then
    return;
  end if;

  select *
    into v_relationship
    from public.organisation_partners
   where id = p_relationship_id
   limit 1;

  if not found then
    return;
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
    return;
  end if;

  v_relationship_status := coalesce(nullif(v_relationship.status, ''), nullif(v_relationship.relationship_status, ''), 'pending');

  if v_relationship_status <> 'accepted' then
    return;
  end if;

  return query
  select
    p_relationship_id,
    v_current_organisation_id,
    case
      when v_relationship.organisation_id = v_current_organisation_id then v_relationship.partner_organisation_id
      else v_relationship.organisation_id
    end,
    exists (
      select 1
      from public.partner_visibility_permissions pvp
      where pvp.relationship_id = p_relationship_id
        and pvp.permission_key = 'can_view_attribution'
        and pvp.is_enabled is true
    ),
    exists (
      select 1
      from public.partner_visibility_permissions pvp
      where pvp.relationship_id = p_relationship_id
        and pvp.permission_key = 'can_view_partner_revenue'
        and pvp.is_enabled is true
    );
end;
$$;

create or replace function public.track_partner_attribution_event_phase6(
  p_relationship_id uuid,
  p_campaign_id uuid default null,
  p_listing_id uuid default null,
  p_application_id uuid default null,
  p_transaction_id uuid default null,
  p_lead_id uuid default null,
  p_event_type text default null,
  p_event_value numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope record;
  v_event public.attribution_events%rowtype;
  v_first_campaign_id uuid;
  v_first_listing_id uuid;
begin
  select * into v_scope
  from public.bridge_validate_partner_attribution_phase6(p_relationship_id)
  limit 1;

  if v_scope.relationship_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  if p_event_type is null or p_event_type not in (
    'listing_view',
    'finance_cta_click',
    'preapproval_started',
    'preapproval_completed',
    'application_created',
    'application_submitted',
    'application_approved',
    'application_declined',
    'transaction_registered'
  ) then
    return jsonb_build_object('error_code', 'invalid_event_type');
  end if;

  if p_campaign_id is not null and not exists (
    select 1
    from public.partner_campaigns pc
    where pc.id = p_campaign_id
      and pc.relationship_id = p_relationship_id
      and pc.is_active is true
  ) then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  if p_listing_id is not null and not exists (
    select 1
    from public.partner_shared_resources psr
    where psr.relationship_id = p_relationship_id
      and psr.resource_type = 'listing'
      and psr.resource_id = p_listing_id
      and psr.is_active is true
  ) and not exists (
    select 1
    from public.partner_campaigns pc
    where pc.relationship_id = p_relationship_id
      and pc.listing_id = p_listing_id
      and pc.is_active is true
  ) then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  insert into public.attribution_events (
    relationship_id,
    campaign_id,
    listing_id,
    application_id,
    transaction_id,
    lead_id,
    event_type,
    event_value
  )
  values (
    p_relationship_id,
    p_campaign_id,
    p_listing_id,
    p_application_id,
    p_transaction_id,
    p_lead_id,
    p_event_type,
    p_event_value
  )
  returning * into v_event;

  if p_application_id is not null and p_event_type in (
    'application_created',
    'application_submitted',
    'application_approved',
    'application_declined',
    'transaction_registered'
  ) then
    select ae.campaign_id, ae.listing_id
      into v_first_campaign_id, v_first_listing_id
      from public.attribution_events ae
     where ae.relationship_id = p_relationship_id
       and (
         ae.application_id = p_application_id
         or (p_transaction_id is not null and ae.transaction_id = p_transaction_id)
         or (p_lead_id is not null and ae.lead_id = p_lead_id)
       )
       and (ae.campaign_id is not null or ae.listing_id is not null)
     order by ae.created_at asc
     limit 1;

    insert into public.application_attribution (
      application_id,
      relationship_id,
      campaign_id,
      listing_id,
      attributed_at
    )
    values (
      p_application_id,
      p_relationship_id,
      coalesce(v_first_campaign_id, p_campaign_id),
      coalesce(v_first_listing_id, p_listing_id),
      now()
    )
    on conflict (application_id)
    do update set
      relationship_id = excluded.relationship_id,
      campaign_id = coalesce(public.application_attribution.campaign_id, excluded.campaign_id),
      listing_id = coalesce(public.application_attribution.listing_id, excluded.listing_id);
  end if;

  return jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event.id,
      'relationship_id', v_event.relationship_id,
      'campaign_id', v_event.campaign_id,
      'listing_id', v_event.listing_id,
      'application_id', v_event.application_id,
      'transaction_id', v_event.transaction_id,
      'lead_id', v_event.lead_id,
      'event_type', v_event.event_type,
      'event_value', v_event.event_value,
      'created_at', v_event.created_at
    )
  );
end;
$$;

create or replace function public.bridge_auto_attribute_bond_application_phase6()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationship_id uuid;
  v_campaign_id uuid;
  v_listing_id uuid;
  v_event_type text;
  v_estimated_revenue numeric := 0;
begin
  select coalesce(pr.relationship_id, t.partner_relationship_id)
    into v_relationship_id
    from public.transactions t
    left join public.partner_referrals pr on pr.transaction_id = t.id and pr.relationship_id is not null
   where t.id = new.transaction_id
   order by pr.referral_date desc nulls last
   limit 1;

  if v_relationship_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.organisation_partners op
    where op.id = v_relationship_id
      and coalesce(nullif(op.status, ''), nullif(op.relationship_status, ''), 'pending') = 'accepted'
  ) then
    return new;
  end if;

  select ae.campaign_id, ae.listing_id
    into v_campaign_id, v_listing_id
    from public.attribution_events ae
   where ae.relationship_id = v_relationship_id
     and ae.transaction_id = new.transaction_id
     and (ae.campaign_id is not null or ae.listing_id is not null)
   order by ae.created_at asc
   limit 1;

  insert into public.application_attribution (
    application_id,
    relationship_id,
    campaign_id,
    listing_id,
    attributed_at
  )
  values (
    new.id,
    v_relationship_id,
    v_campaign_id,
    v_listing_id,
    now()
  )
  on conflict (application_id)
  do update set
    relationship_id = excluded.relationship_id,
    campaign_id = coalesce(public.application_attribution.campaign_id, excluded.campaign_id),
    listing_id = coalesce(public.application_attribution.listing_id, excluded.listing_id);

  if tg_op = 'INSERT' then
    v_event_type := 'application_created';
  elsif new.status is distinct from old.status then
    v_event_type := case
      when new.status in ('submitted') then 'application_submitted'
      when new.status in ('approved', 'buyer_approved') then 'application_approved'
      when new.status in ('declined') then 'application_declined'
      else null
    end;
  end if;

  if v_event_type is not null and not exists (
    select 1
    from public.attribution_events ae
    where ae.relationship_id = v_relationship_id
      and ae.application_id = new.id
      and ae.event_type = v_event_type
  ) then
    insert into public.attribution_events (
      relationship_id,
      campaign_id,
      listing_id,
      application_id,
      transaction_id,
      event_type
    )
    values (
      v_relationship_id,
      v_campaign_id,
      v_listing_id,
      new.id,
      new.transaction_id,
      v_event_type
    );
  end if;

  if new.status in ('approved', 'buyer_approved') then
    select round(greatest(0, coalesce(t.bond_amount, t.purchase_price, t.sales_price, 0)) * 0.02, 2)
      into v_estimated_revenue
      from public.transactions t
     where t.id = new.transaction_id;

    insert into public.partner_revenue_attribution (
      relationship_id,
      application_id,
      transaction_id,
      attributed_revenue,
      revenue_type
    )
    values (
      v_relationship_id,
      new.id,
      new.transaction_id,
      coalesce(v_estimated_revenue, 0),
      'bond'
    )
    on conflict (relationship_id, application_id, revenue_type)
    where application_id is not null
    do update set
      attributed_revenue = greatest(public.partner_revenue_attribution.attributed_revenue, excluded.attributed_revenue);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bond_application_attribution_phase6 on public.transaction_bond_applications;
create trigger trg_bond_application_attribution_phase6
after insert or update of status on public.transaction_bond_applications
for each row
execute function public.bridge_auto_attribute_bond_application_phase6();

create or replace function public.get_partner_attribution_summary_phase6(p_relationship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope record;
  v_partner_name text := 'Partner';
  v_kpis jsonb := '{}'::jsonb;
  v_funnel jsonb := '[]'::jsonb;
  v_roi jsonb := '{}'::jsonb;
  v_revenue jsonb := '{}'::jsonb;
  v_trend jsonb := '[]'::jsonb;
begin
  select * into v_scope
  from public.bridge_validate_partner_attribution_phase6(p_relationship_id)
  limit 1;

  if v_scope.relationship_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select coalesce(nullif(o.name, ''), 'Partner')
    into v_partner_name
    from public.organisations o
   where o.id = v_scope.partner_organisation_id;

  if v_scope.can_view_attribution then
    with event_counts as (
      select event_type, count(*) as count_value
      from public.attribution_events
      where relationship_id = p_relationship_id
      group by event_type
    ),
    app_counts as (
      select
        count(distinct aa.application_id) as attributed_applications,
        count(distinct aa.application_id) filter (where tba.status in ('approved', 'buyer_approved')) as approvals
      from public.application_attribution aa
      left join public.transaction_bond_applications tba on tba.id = aa.application_id
      where aa.relationship_id = p_relationship_id
    ),
    lead_counts as (
      select count(distinct lead_id) as attributed_leads
      from public.attribution_events
      where relationship_id = p_relationship_id
        and lead_id is not null
    ),
    revenue_counts as (
      select coalesce(sum(attributed_revenue), 0) as attributed_revenue
      from public.partner_revenue_attribution
      where relationship_id = p_relationship_id
    )
    select jsonb_build_object(
      'attributed_leads', coalesce(lc.attributed_leads, 0),
      'attributed_applications', coalesce(ac.attributed_applications, 0),
      'attributed_revenue', case when v_scope.can_view_partner_revenue then coalesce(rc.attributed_revenue, 0) else 0 end,
      'conversion_rate', case
        when coalesce((select count_value from event_counts where event_type = 'finance_cta_click'), 0) > 0
          then round((coalesce(ac.attributed_applications, 0)::numeric / (select count_value from event_counts where event_type = 'finance_cta_click')::numeric) * 100, 2)
        else 0
      end
    )
      into v_kpis
      from app_counts ac cross join lead_counts lc cross join revenue_counts rc;

    with funnel_labels as (
      select * from (values
        ('listing_view', 'Listing Views', 1),
        ('finance_cta_click', 'Finance CTA Clicks', 2),
        ('preapproval_started', 'Preapproval Starts', 3),
        ('application_created', 'Applications', 4),
        ('application_approved', 'Approvals', 5),
        ('transaction_registered', 'Registrations', 6)
      ) as rows(event_type, label, sort_order)
    ),
    event_counts as (
      select event_type, count(*) as count_value
      from public.attribution_events
      where relationship_id = p_relationship_id
      group by event_type
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', fl.event_type,
      'label', fl.label,
      'count', coalesce(ec.count_value, 0)
    ) order by fl.sort_order), '[]'::jsonb)
      into v_funnel
      from funnel_labels fl
      left join event_counts ec on ec.event_type = fl.event_type;

    v_roi := jsonb_build_object(
      'partner_name', v_partner_name,
      'applications', coalesce((v_kpis->>'attributed_applications')::numeric, 0),
      'approvals', coalesce((select count(*) from public.attribution_events where relationship_id = p_relationship_id and event_type = 'application_approved'), 0),
      'revenue', case when v_scope.can_view_partner_revenue then coalesce((v_kpis->>'attributed_revenue')::numeric, 0) else 0 end,
      'roi_score', round(
        (
          coalesce((v_kpis->>'attributed_applications')::numeric, 0) * 2
          + coalesce((select count(*) from public.attribution_events where relationship_id = p_relationship_id and event_type = 'application_approved'), 0) * 5
          + case when v_scope.can_view_partner_revenue then coalesce((v_kpis->>'attributed_revenue')::numeric, 0) / 10000 else 0 end
        )::numeric,
        1
      )
    );
  end if;

  if v_scope.can_view_partner_revenue then
    with revenue_rows as (
      select *
      from public.partner_revenue_attribution
      where relationship_id = p_relationship_id
    ),
    summary as (
      select
        coalesce(sum(attributed_revenue) filter (where created_at >= date_trunc('month', now())), 0) as revenue_this_month,
        coalesce(sum(attributed_revenue) filter (
          where created_at >= date_trunc('month', now()) - interval '1 month'
            and created_at < date_trunc('month', now())
        ), 0) as revenue_last_month,
        coalesce(sum(attributed_revenue), 0) as total_revenue
      from revenue_rows
    )
    select jsonb_build_object(
      'revenue_this_month', revenue_this_month,
      'revenue_last_month', revenue_last_month,
      'growth', case
        when revenue_last_month = 0 and revenue_this_month > 0 then 100
        when revenue_last_month = 0 then 0
        else round(((revenue_this_month - revenue_last_month) / revenue_last_month) * 100, 2)
      end,
      'projected_revenue', round(revenue_this_month * 1.2, 2),
      'total_revenue', total_revenue
    )
      into v_revenue
      from summary;

    with monthly as (
      select date_trunc('month', created_at)::date as month_start, sum(attributed_revenue) as revenue
      from public.partner_revenue_attribution
      where relationship_id = p_relationship_id
      group by 1
    )
    select coalesce(jsonb_agg(jsonb_build_object('month', month_start, 'revenue', revenue) order by month_start), '[]'::jsonb)
      into v_trend
      from monthly;
  end if;

  return jsonb_build_object(
    'relationship_id', p_relationship_id,
    'partner_organisation_id', v_scope.partner_organisation_id,
    'permissions', jsonb_build_object(
      'can_view_attribution', v_scope.can_view_attribution,
      'can_view_partner_revenue', v_scope.can_view_partner_revenue
    ),
    'kpis', v_kpis,
    'funnel', v_funnel,
    'partner_roi', v_roi,
    'revenue_intelligence', v_revenue,
    'revenue_trend', v_trend
  );
end;
$$;

create or replace function public.get_campaign_performance_phase6(p_relationship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope record;
  v_campaigns jsonb := '[]'::jsonb;
begin
  select * into v_scope
  from public.bridge_validate_partner_attribution_phase6(p_relationship_id)
  limit 1;

  if v_scope.relationship_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  if v_scope.can_view_attribution then
    with rows as (
      select
        pc.id,
        pc.campaign_name,
        pc.campaign_type,
        pc.status,
        count(distinct coalesce(pc.listing_id, aa.listing_id)) filter (where coalesce(pc.listing_id, aa.listing_id) is not null) as listings_promoted,
        count(distinct aa.application_id) as applications_generated,
        count(distinct aa.application_id) filter (where tba.status in ('approved', 'buyer_approved')) as approvals,
        case when v_scope.can_view_partner_revenue then coalesce(sum(distinct pra.attributed_revenue), 0) else 0 end as revenue_generated
      from public.partner_campaigns pc
      left join public.application_attribution aa on aa.campaign_id = pc.id and aa.relationship_id = pc.relationship_id
      left join public.transaction_bond_applications tba on tba.id = aa.application_id
      left join public.partner_revenue_attribution pra on pra.application_id = aa.application_id and pra.relationship_id = pc.relationship_id
      where pc.relationship_id = p_relationship_id
        and pc.is_active is true
      group by pc.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'campaign_id', id,
      'campaign_name', campaign_name,
      'campaign_type', campaign_type,
      'status', status,
      'listings_promoted', listings_promoted,
      'applications_generated', applications_generated,
      'approvals', approvals,
      'revenue_generated', revenue_generated
    ) order by applications_generated desc, campaign_name), '[]'::jsonb)
      into v_campaigns
      from rows;
  end if;

  return jsonb_build_object(
    'relationship_id', p_relationship_id,
    'permissions', jsonb_build_object(
      'can_view_attribution', v_scope.can_view_attribution,
      'can_view_partner_revenue', v_scope.can_view_partner_revenue
    ),
    'campaigns', v_campaigns
  );
end;
$$;

create or replace function public.get_listing_attribution_phase6(p_relationship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope record;
  v_listings jsonb := '[]'::jsonb;
begin
  select * into v_scope
  from public.bridge_validate_partner_attribution_phase6(p_relationship_id)
  limit 1;

  if v_scope.relationship_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  if v_scope.can_view_attribution then
    with shared_listings as (
      select
        pl.id,
        coalesce(nullif(lpd.title, ''), nullif(pl.title, ''), nullif(pl.address_line_1, ''), 'Shared listing') as title
      from public.partner_shared_resources psr
      join public.private_listings pl on pl.id = psr.resource_id
      left join public.listing_publication_data lpd on lpd.listing_id = pl.id
      where psr.relationship_id = p_relationship_id
        and psr.resource_type = 'listing'
        and psr.is_active is true
    ),
    rows as (
      select
        sl.id,
        sl.title,
        count(distinct aa.application_id) as applications_generated,
        count(distinct aa.application_id) filter (where tba.status in ('approved', 'buyer_approved')) as approvals,
        count(ae.id) filter (where ae.event_type = 'listing_view') as listing_views,
        count(ae.id) filter (where ae.event_type = 'finance_cta_click') as finance_cta_clicks,
        case when v_scope.can_view_partner_revenue then coalesce(sum(distinct pra.attributed_revenue), 0) else 0 end as revenue_generated
      from shared_listings sl
      left join public.application_attribution aa on aa.relationship_id = p_relationship_id and aa.listing_id = sl.id
      left join public.transaction_bond_applications tba on tba.id = aa.application_id
      left join public.partner_revenue_attribution pra on pra.application_id = aa.application_id and pra.relationship_id = p_relationship_id
      left join public.attribution_events ae on ae.relationship_id = p_relationship_id and ae.listing_id = sl.id
      group by sl.id, sl.title
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'listing_id', id,
      'title', title,
      'listing_views', listing_views,
      'finance_cta_clicks', finance_cta_clicks,
      'applications_generated', applications_generated,
      'approvals', approvals,
      'revenue_generated', revenue_generated
    ) order by applications_generated desc, listing_views desc, title), '[]'::jsonb)
      into v_listings
      from rows;
  end if;

  return jsonb_build_object(
    'relationship_id', p_relationship_id,
    'permissions', jsonb_build_object(
      'can_view_attribution', v_scope.can_view_attribution,
      'can_view_partner_revenue', v_scope.can_view_partner_revenue
    ),
    'listings', v_listings
  );
end;
$$;

create or replace function public.get_partner_revenue_summary_phase6(p_relationship_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.get_partner_attribution_summary_phase6(p_relationship_id);
$$;

grant select, insert on public.attribution_events to authenticated;
grant select on public.application_attribution to authenticated;
grant select on public.partner_revenue_attribution to authenticated;
grant execute on function public.bridge_validate_partner_attribution_phase6(uuid) to authenticated;
grant execute on function public.track_partner_attribution_event_phase6(uuid, uuid, uuid, uuid, uuid, uuid, text, numeric) to authenticated;
grant execute on function public.get_partner_attribution_summary_phase6(uuid) to authenticated;
grant execute on function public.get_partner_revenue_summary_phase6(uuid) to authenticated;
grant execute on function public.get_campaign_performance_phase6(uuid) to authenticated;
grant execute on function public.get_listing_attribution_phase6(uuid) to authenticated;

commit;
