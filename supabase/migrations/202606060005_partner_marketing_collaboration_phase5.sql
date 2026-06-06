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
      'can_view_listing_opportunities'
    )
  );

create table if not exists public.partner_campaigns (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.organisation_partners(id) on delete cascade,
  listing_id uuid references public.private_listings(id) on delete set null,
  campaign_name text not null,
  campaign_type text not null,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_active boolean not null default true,
  constraint partner_campaigns_type_check check (
    campaign_type in ('listing_finance', 'development_finance', 'preapproval_drive', 'buyer_education', 'bond_awareness')
  ),
  constraint partner_campaigns_status_check check (
    status in ('draft', 'active', 'paused', 'completed', 'archived')
  )
);

create index if not exists partner_campaigns_relationship_idx
  on public.partner_campaigns (relationship_id, status, created_at desc);

create index if not exists partner_campaigns_listing_idx
  on public.partner_campaigns (listing_id)
  where listing_id is not null;

create table if not exists public.listing_finance_profiles (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.private_listings(id) on delete cascade,
  purchase_price numeric(14, 2) not null default 0,
  deposit_amount numeric(14, 2) not null default 0,
  interest_rate numeric(8, 4) not null default 11.75,
  loan_term integer not null default 20,
  estimated_repayment numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_finance_profiles_listing_unique unique (listing_id)
);

create table if not exists public.partner_campaign_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.partner_campaigns(id) on delete cascade,
  relationship_id uuid not null references public.organisation_partners(id) on delete cascade,
  listing_id uuid references public.private_listings(id) on delete set null,
  tracking_code text not null,
  link_slug text not null,
  created_at timestamptz not null default now(),
  constraint partner_campaign_links_tracking_unique unique (tracking_code),
  constraint partner_campaign_links_slug_unique unique (link_slug)
);

create index if not exists partner_campaign_links_campaign_idx
  on public.partner_campaign_links (campaign_id);

create index if not exists partner_campaign_links_relationship_idx
  on public.partner_campaign_links (relationship_id, created_at desc);

create table if not exists public.campaign_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.partner_campaigns(id) on delete cascade,
  asset_type text not null,
  asset_title text not null,
  asset_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_assets_type_check check (
    asset_type in ('property_flyer', 'social_post', 'finance_cta_banner', 'preapproval_banner')
  )
);

drop trigger if exists trg_partner_campaigns_updated_at on public.partner_campaigns;
create trigger trg_partner_campaigns_updated_at
before update on public.partner_campaigns
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists trg_listing_finance_profiles_updated_at on public.listing_finance_profiles;
create trigger trg_listing_finance_profiles_updated_at
before update on public.listing_finance_profiles
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists trg_campaign_assets_updated_at on public.campaign_assets;
create trigger trg_campaign_assets_updated_at
before update on public.campaign_assets
for each row
execute function public.set_updated_at_timestamp();

alter table public.partner_campaigns enable row level security;
alter table public.listing_finance_profiles enable row level security;
alter table public.partner_campaign_links enable row level security;
alter table public.campaign_assets enable row level security;

drop policy if exists partner_campaigns_select_related_orgs on public.partner_campaigns;
create policy partner_campaigns_select_related_orgs
on public.partner_campaigns
for select to authenticated
using (
  exists (
    select 1
    from public.organisation_partners op
    where op.id = partner_campaigns.relationship_id
      and (
        public.bridge_is_active_member(op.organisation_id)
        or public.bridge_is_active_member(op.partner_organisation_id)
      )
  )
);

drop policy if exists partner_campaigns_manage_related_orgs on public.partner_campaigns;
create policy partner_campaigns_manage_related_orgs
on public.partner_campaigns
for all to authenticated
using (
  exists (
    select 1
    from public.organisation_partners op
    where op.id = partner_campaigns.relationship_id
      and (
        public.bridge_is_active_member(op.organisation_id)
        or public.bridge_is_active_member(op.partner_organisation_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.organisation_partners op
    where op.id = partner_campaigns.relationship_id
      and (
        public.bridge_is_active_member(op.organisation_id)
        or public.bridge_is_active_member(op.partner_organisation_id)
      )
  )
);

drop policy if exists listing_finance_profiles_select_listing_owner_or_shared on public.listing_finance_profiles;
create policy listing_finance_profiles_select_listing_owner_or_shared
on public.listing_finance_profiles
for select to authenticated
using (
  exists (
    select 1
    from public.private_listings pl
    where pl.id = listing_finance_profiles.listing_id
      and public.bridge_is_active_member(pl.organisation_id)
  )
  or exists (
    select 1
    from public.partner_shared_resources psr
    join public.organisation_partners op on op.id = psr.relationship_id
    where psr.resource_type = 'listing'
      and psr.resource_id = listing_finance_profiles.listing_id
      and psr.is_active is true
      and (
        public.bridge_is_active_member(op.organisation_id)
        or public.bridge_is_active_member(op.partner_organisation_id)
      )
  )
);

drop policy if exists partner_campaign_links_select_related_orgs on public.partner_campaign_links;
create policy partner_campaign_links_select_related_orgs
on public.partner_campaign_links
for select to authenticated
using (
  exists (
    select 1
    from public.organisation_partners op
    where op.id = partner_campaign_links.relationship_id
      and (
        public.bridge_is_active_member(op.organisation_id)
        or public.bridge_is_active_member(op.partner_organisation_id)
      )
  )
);

drop policy if exists campaign_assets_select_related_orgs on public.campaign_assets;
create policy campaign_assets_select_related_orgs
on public.campaign_assets
for select to authenticated
using (
  exists (
    select 1
    from public.partner_campaigns pc
    join public.organisation_partners op on op.id = pc.relationship_id
    where pc.id = campaign_assets.campaign_id
      and (
        public.bridge_is_active_member(op.organisation_id)
        or public.bridge_is_active_member(op.partner_organisation_id)
      )
  )
);

create or replace function public.bridge_partner_campaign_slug()
returns text
language sql
volatile
set search_path = public
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

create or replace function public.get_bond_partner_campaign_centre_phase5(p_relationship_id uuid)
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
  v_can_view_campaigns boolean := false;
  v_can_create_finance_campaigns boolean := false;
  v_can_generate_finance_assets boolean := false;
  v_can_view_listing_opportunities boolean := false;
  v_campaigns jsonb := '[]'::jsonb;
  v_opportunities jsonb := '[]'::jsonb;
  v_kpis jsonb := '{}'::jsonb;
  v_basic_analytics jsonb := '{}'::jsonb;
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

  select exists (select 1 from public.partner_visibility_permissions where relationship_id = p_relationship_id and permission_key = 'can_view_campaigns' and is_enabled is true)
    into v_can_view_campaigns;
  select exists (select 1 from public.partner_visibility_permissions where relationship_id = p_relationship_id and permission_key = 'can_create_finance_campaigns' and is_enabled is true)
    into v_can_create_finance_campaigns;
  select exists (select 1 from public.partner_visibility_permissions where relationship_id = p_relationship_id and permission_key = 'can_generate_finance_assets' and is_enabled is true)
    into v_can_generate_finance_assets;
  select exists (select 1 from public.partner_visibility_permissions where relationship_id = p_relationship_id and permission_key = 'can_view_listing_opportunities' and is_enabled is true)
    into v_can_view_listing_opportunities;

  if v_can_view_campaigns then
    select coalesce(jsonb_agg(campaign_payload order by campaign_payload->>'created_at' desc), '[]'::jsonb)
      into v_campaigns
      from (
        select jsonb_build_object(
          'id', pc.id,
          'listing_id', pc.listing_id,
          'campaign_name', pc.campaign_name,
          'campaign_type', pc.campaign_type,
          'status', pc.status,
          'created_at', pc.created_at,
          'listing_title', coalesce(nullif(lpd.title, ''), nullif(pl.title, ''), nullif(pl.address_line_1, ''), 'Listing campaign'),
          'estimated_repayment', lfp.estimated_repayment,
          'tracking_link_count', count(pcl.id),
          'asset_count', count(ca.id)
        ) as campaign_payload
        from public.partner_campaigns pc
        left join public.private_listings pl on pl.id = pc.listing_id
        left join public.listing_publication_data lpd on lpd.listing_id = pl.id
        left join public.listing_finance_profiles lfp on lfp.listing_id = pc.listing_id
        left join public.partner_campaign_links pcl on pcl.campaign_id = pc.id
        left join public.campaign_assets ca on ca.campaign_id = pc.id
        where pc.relationship_id = p_relationship_id
          and pc.is_active is true
        group by pc.id, pl.id, lpd.id, lfp.id
      ) rows;

    select jsonb_build_object(
      'active_campaigns', count(*) filter (where status = 'active' and is_active is true),
      'finance_enquiries', 0,
      'applications_generated', 0,
      'conversion_rate', 0,
      'campaigns_created', count(*) filter (where is_active is true),
      'links_generated', coalesce((select count(*) from public.partner_campaign_links where relationship_id = p_relationship_id), 0),
      'applications_linked', 0,
      'active_listings_promoted', count(distinct listing_id) filter (where listing_id is not null and status = 'active' and is_active is true)
    )
      into v_kpis
      from public.partner_campaigns
     where relationship_id = p_relationship_id;

    v_basic_analytics := jsonb_build_object(
      'campaigns_created', coalesce((v_kpis->>'campaigns_created')::integer, 0),
      'links_generated', coalesce((v_kpis->>'links_generated')::integer, 0),
      'applications_linked', 0,
      'active_listings_promoted', coalesce((v_kpis->>'active_listings_promoted')::integer, 0)
    );
  end if;

  if v_can_view_listing_opportunities then
    with shared_listings as (
      select
        pl.id,
        coalesce(nullif(lpd.title, ''), nullif(pl.title, ''), nullif(pl.address_line_1, ''), 'Shared listing') as title,
        coalesce(lpd.asking_price, pl.asking_price, 0) as price,
        pl.created_at,
        coalesce(nullif(pl.bridge_listing_status, ''), 'not_published') as bridge_status,
        coalesce(nullif(pl.property24_status, ''), 'not_published') as property24_status,
        coalesce(nullif(pl.private_property_status, ''), 'not_published') as private_property_status
      from public.partner_shared_resources psr
      join public.private_listings pl on pl.id = psr.resource_id
      left join public.listing_publication_data lpd on lpd.listing_id = pl.id
      where psr.relationship_id = p_relationship_id
        and psr.resource_type = 'listing'
        and psr.is_active is true
        and pl.organisation_id = v_partner_organisation_id
    ),
    opportunity_rows as (
      select jsonb_build_object(
        'key', 'listings_without_finance',
        'label', count(*) || ' Active Listings',
        'description', 'No finance promotion',
        'action_label', 'Create Campaign',
        'opportunity_type', 'listing_finance',
        'count', count(*),
        'listing_ids', coalesce(jsonb_agg(id) filter (where id is not null), '[]'::jsonb)
      ) as item
      from shared_listings sl
      where not exists (
        select 1 from public.partner_campaigns pc
        where pc.relationship_id = p_relationship_id
          and pc.listing_id = sl.id
          and pc.is_active is true
      )
      union all
      select jsonb_build_object(
        'key', 'listings_above_2m',
        'label', count(*) || ' Listings Above R2m',
        'description', 'Add repayment examples',
        'action_label', 'Generate Repayment Examples',
        'opportunity_type', 'repayment_example',
        'count', count(*),
        'listing_ids', coalesce(jsonb_agg(id) filter (where id is not null), '[]'::jsonb)
      )
      from shared_listings
      where price >= 2000000
      union all
      select jsonb_build_object(
        'key', 'published_no_campaign',
        'label', count(*) || ' Listings Being Marketed',
        'description', 'No bond campaign',
        'action_label', 'Promote Pre-Approval',
        'opportunity_type', 'preapproval_drive',
        'count', count(*),
        'listing_ids', coalesce(jsonb_agg(id) filter (where id is not null), '[]'::jsonb)
      )
      from shared_listings
      where bridge_status = 'published' or property24_status = 'published' or private_property_status = 'published'
      union all
      select jsonb_build_object(
        'key', 'new_listings_this_week',
        'label', count(*) || ' New Listings Added This Week',
        'description', 'Create finance pack',
        'action_label', 'Create Finance Pack',
        'opportunity_type', 'finance_pack',
        'count', count(*),
        'listing_ids', coalesce(jsonb_agg(id) filter (where id is not null), '[]'::jsonb)
      )
      from shared_listings
      where created_at >= now() - interval '7 days'
    )
    select coalesce(jsonb_agg(item) filter (where (item->>'count')::integer > 0), '[]'::jsonb)
      into v_opportunities
      from opportunity_rows;
  end if;

  return jsonb_build_object(
    'relationship_id', p_relationship_id,
    'partner_organisation_id', v_partner_organisation_id,
    'permissions', jsonb_build_object(
      'can_view_campaigns', v_can_view_campaigns,
      'can_create_finance_campaigns', v_can_create_finance_campaigns,
      'can_generate_finance_assets', v_can_generate_finance_assets,
      'can_view_listing_opportunities', v_can_view_listing_opportunities
    ),
    'kpis', v_kpis,
    'opportunities', v_opportunities,
    'campaigns', v_campaigns,
    'analytics', v_basic_analytics
  );
end;
$$;

create or replace function public.create_bond_partner_finance_campaign_phase5(
  p_relationship_id uuid,
  p_listing_id uuid,
  p_campaign_type text default 'listing_finance',
  p_campaign_name text default null,
  p_deposit_percent numeric default 10,
  p_interest_rate numeric default 11.75,
  p_loan_term integer default 20
)
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
  v_can_create boolean := false;
  v_can_generate boolean := false;
  v_can_view_listings boolean := false;
  v_listing public.private_listings%rowtype;
  v_listing_title text;
  v_price numeric := 0;
  v_deposit numeric := 0;
  v_principal numeric := 0;
  v_monthly_rate numeric := 0;
  v_months integer := 240;
  v_repayment numeric := 0;
  v_campaign public.partner_campaigns%rowtype;
  v_tracking_code text;
  v_slug text;
begin
  if auth.uid() is null or p_relationship_id is null or p_listing_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select * into v_relationship from public.organisation_partners where id = p_relationship_id limit 1;
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

  select exists (select 1 from public.partner_visibility_permissions where relationship_id = p_relationship_id and permission_key = 'can_create_finance_campaigns' and is_enabled is true)
    into v_can_create;
  select exists (select 1 from public.partner_visibility_permissions where relationship_id = p_relationship_id and permission_key = 'can_generate_finance_assets' and is_enabled is true)
    into v_can_generate;
  select exists (select 1 from public.partner_visibility_permissions where relationship_id = p_relationship_id and permission_key = 'can_view_listings' and is_enabled is true)
    into v_can_view_listings;

  if not (v_can_create and v_can_generate and v_can_view_listings) then
    return jsonb_build_object('error_code', 'permission_denied');
  end if;

  if p_campaign_type not in ('listing_finance', 'development_finance', 'preapproval_drive', 'buyer_education', 'bond_awareness') then
    return jsonb_build_object('error_code', 'invalid_campaign_type');
  end if;

  select * into v_listing from public.private_listings where id = p_listing_id limit 1;
  if not found or v_listing.organisation_id <> v_partner_organisation_id then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  if not exists (
    select 1
    from public.partner_shared_resources psr
    where psr.relationship_id = p_relationship_id
      and psr.resource_type = 'listing'
      and psr.resource_id = p_listing_id
      and psr.is_active is true
  ) then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select
    coalesce(nullif(lpd.title, ''), nullif(v_listing.title, ''), nullif(v_listing.address_line_1, ''), 'Shared listing'),
    coalesce(lpd.asking_price, v_listing.asking_price, 0)
    into v_listing_title, v_price
    from public.private_listings pl
    left join public.listing_publication_data lpd on lpd.listing_id = pl.id
   where pl.id = p_listing_id;

  v_deposit := greatest(0, round(v_price * greatest(0, coalesce(p_deposit_percent, 10)) / 100, 2));
  v_principal := greatest(0, v_price - v_deposit);
  v_months := greatest(12, coalesce(p_loan_term, 20) * 12);
  v_monthly_rate := greatest(0, coalesce(p_interest_rate, 11.75)) / 100 / 12;

  if v_principal <= 0 then
    v_repayment := 0;
  elsif v_monthly_rate = 0 then
    v_repayment := round(v_principal / v_months, 2);
  else
    v_repayment := round(v_principal * (v_monthly_rate * power(1 + v_monthly_rate, v_months)) / (power(1 + v_monthly_rate, v_months) - 1), 2);
  end if;

  insert into public.listing_finance_profiles (
    listing_id,
    purchase_price,
    deposit_amount,
    interest_rate,
    loan_term,
    estimated_repayment
  )
  values (
    p_listing_id,
    v_price,
    v_deposit,
    coalesce(p_interest_rate, 11.75),
    coalesce(p_loan_term, 20),
    v_repayment
  )
  on conflict (listing_id)
  do update set
    purchase_price = excluded.purchase_price,
    deposit_amount = excluded.deposit_amount,
    interest_rate = excluded.interest_rate,
    loan_term = excluded.loan_term,
    estimated_repayment = excluded.estimated_repayment,
    updated_at = now();

  insert into public.partner_campaigns (
    relationship_id,
    listing_id,
    campaign_name,
    campaign_type,
    status,
    created_by,
    is_active
  )
  values (
    p_relationship_id,
    p_listing_id,
    coalesce(nullif(p_campaign_name, ''), v_listing_title || ' Finance Campaign'),
    p_campaign_type,
    'active',
    auth.uid(),
    true
  )
  returning * into v_campaign;

  v_tracking_code := public.bridge_partner_campaign_slug();
  v_slug := lower('preapproval-' || v_tracking_code);

  insert into public.partner_campaign_links (
    campaign_id,
    relationship_id,
    listing_id,
    tracking_code,
    link_slug
  )
  values (
    v_campaign.id,
    p_relationship_id,
    p_listing_id,
    v_tracking_code,
    v_slug
  );

  insert into public.campaign_assets (campaign_id, asset_type, asset_title, asset_payload)
  values
    (
      v_campaign.id,
      'finance_cta_banner',
      'Finance CTA Banner',
      jsonb_build_object(
        'headline', 'Estimated repayment from R' || trim(to_char(v_repayment, 'FM999G999G999')) || '/month',
        'listing_title', v_listing_title,
        'purchase_price', v_price,
        'deposit_amount', v_deposit
      )
    ),
    (
      v_campaign.id,
      'preapproval_banner',
      'Pre-Approval Banner',
      jsonb_build_object(
        'headline', 'Get Pre-Approved For This Property',
        'tracking_code', v_tracking_code,
        'link_slug', v_slug
      )
    );

  return jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', v_campaign.id,
      'listing_id', v_campaign.listing_id,
      'campaign_name', v_campaign.campaign_name,
      'campaign_type', v_campaign.campaign_type,
      'status', v_campaign.status,
      'created_at', v_campaign.created_at
    ),
    'finance_profile', jsonb_build_object(
      'purchase_price', v_price,
      'deposit_amount', v_deposit,
      'interest_rate', coalesce(p_interest_rate, 11.75),
      'loan_term', coalesce(p_loan_term, 20),
      'estimated_repayment', v_repayment
    ),
    'link', jsonb_build_object(
      'tracking_code', v_tracking_code,
      'link_slug', v_slug,
      'url', '/preapproval/' || v_tracking_code
    )
  );
end;
$$;

grant select, insert, update on public.partner_campaigns to authenticated;
grant select, insert, update on public.listing_finance_profiles to authenticated;
grant select, insert on public.partner_campaign_links to authenticated;
grant select, insert on public.campaign_assets to authenticated;
grant execute on function public.get_bond_partner_campaign_centre_phase5(uuid) to authenticated;
grant execute on function public.create_bond_partner_finance_campaign_phase5(uuid, uuid, text, text, numeric, numeric, integer) to authenticated;

commit;
