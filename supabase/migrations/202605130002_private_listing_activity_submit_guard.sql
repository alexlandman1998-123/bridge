begin;

create table if not exists public.private_listing_activity (
  id uuid primary key default gen_random_uuid(),
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  activity_type text,
  activity_title text,
  activity_description text,
  performed_by uuid references auth.users(id) on delete set null,
  visibility text not null default 'internal',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint private_listing_activity_visibility_check check (
    visibility in ('internal', 'shared', 'client_visible')
  )
);

create index if not exists private_listing_activity_listing_idx
  on public.private_listing_activity(private_listing_id, created_at desc);
create index if not exists private_listing_activity_type_idx
  on public.private_listing_activity(activity_type);

alter table public.private_listing_activity enable row level security;

drop policy if exists private_listing_activity_select_member on public.private_listing_activity;
create policy private_listing_activity_select_member
on public.private_listing_activity
for select
to authenticated
using (
  exists (
    select 1
    from public.private_listings pl
    where pl.id = private_listing_id
      and public.bridge_is_active_member(pl.organisation_id)
  )
);

drop policy if exists private_listing_activity_insert_member on public.private_listing_activity;
create policy private_listing_activity_insert_member
on public.private_listing_activity
for insert
to authenticated
with check (
  exists (
    select 1
    from public.private_listings pl
    where pl.id = private_listing_id
      and (
        public.bridge_is_org_admin(pl.organisation_id)
        or pl.assigned_agent_id = auth.uid()
        or pl.created_by = auth.uid()
      )
  )
);

grant select, insert on public.private_listing_activity to authenticated;

create or replace function public.bridge_complete_private_listing_seller_onboarding(
  p_token text,
  p_form_data jsonb default '{}'::jsonb,
  p_seller_type text default null,
  p_ownership_structure text default null,
  p_marital_regime text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_form_data jsonb := coalesce(p_form_data, '{}'::jsonb);
begin
  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
    and (token_expires_at is null or token_expires_at > now())
  limit 1;

  if not found then
    return null;
  end if;

  update public.private_listing_seller_onboarding
     set status = 'completed',
         form_data = coalesce(form_data, '{}'::jsonb) || v_form_data,
         seller_type = coalesce(nullif(trim(p_seller_type), ''), seller_type),
         ownership_structure = coalesce(nullif(trim(p_ownership_structure), ''), ownership_structure),
         marital_regime = coalesce(nullif(trim(p_marital_regime), ''), marital_regime),
         submitted_at = coalesce(submitted_at, now()),
         updated_at = now()
   where id = v_onboarding.id;

  update public.private_listings
     set listing_status = case
           when listing_status in ('seller_lead', 'onboarding_sent') then 'onboarding_completed'
           else listing_status
         end,
         seller_onboarding_status = 'completed',
         seller_type = coalesce(nullif(trim(p_seller_type), ''), seller_type),
         updated_at = now()
   where id = v_onboarding.private_listing_id;

  if to_regclass('public.private_listing_activity') is not null then
    begin
      insert into public.private_listing_activity (
        private_listing_id,
        activity_type,
        activity_title,
        activity_description,
        visibility,
        metadata
      )
      values (
        v_onboarding.private_listing_id,
        'seller_onboarding_completed',
        'Seller onboarding completed',
        'Seller completed onboarding from the secure seller portal.',
        'internal',
        jsonb_build_object('submittedAt', now(), 'source', 'seller_portal')
      )
      on conflict do nothing;
    exception
      when undefined_table or undefined_column then
        null;
    end;
  end if;

  return public.bridge_private_listing_seller_portal_payload(p_token);
end;
$$;

grant execute on function public.bridge_complete_private_listing_seller_onboarding(text, jsonb, text, text, text) to anon, authenticated;

commit;
