create table if not exists public.private_listing_seller_portal_task_plans (
  id uuid primary key default gen_random_uuid(),
  private_listing_id uuid not null unique references public.private_listings(id) on delete cascade,
  seller_onboarding_id uuid not null references public.private_listing_seller_onboarding(id) on delete cascade,
  signing_session_id uuid not null references public.private_listing_mandate_signing_sessions(id) on delete cascade,
  task_plan jsonb not null default '[]'::jsonb check (jsonb_typeof(task_plan) = 'array'),
  source text not null default 'direct_listing_signing_pack',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.private_listing_seller_portal_task_plans enable row level security;
revoke all on table public.private_listing_seller_portal_task_plans from public, anon, authenticated;

create or replace function public.bridge_project_listing_seller_portal_document_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.private_listing_mandate_signing_sessions%rowtype;
  v_tasks jsonb := '[]'::jsonb;
begin
  select * into v_session from public.private_listing_mandate_signing_sessions
  where id = new.signing_session_id;
  if not found or v_session.status <> 'signed' then return new; end if;
  if v_session.signing_group_id is not null and exists (
    select 1 from public.private_listing_mandate_signing_sessions
    where signing_group_id = v_session.signing_group_id and status <> 'signed'
  ) then return new; end if;

  v_tasks := case
    when jsonb_typeof(v_session.signing_pack_snapshot -> 'sellerPortalTasks') = 'array'
      then v_session.signing_pack_snapshot -> 'sellerPortalTasks'
    else '[]'::jsonb
  end;

  insert into public.private_listing_seller_portal_task_plans (
    private_listing_id, seller_onboarding_id, signing_session_id, task_plan
  ) values (
    new.private_listing_id, new.seller_onboarding_id, v_session.id, v_tasks
  ) on conflict (private_listing_id) do update
    set seller_onboarding_id = excluded.seller_onboarding_id,
        signing_session_id = excluded.signing_session_id,
        task_plan = excluded.task_plan,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists private_listing_seller_portal_task_plan_projection on public.private_listing_seller_portal_recipient_invites;
create trigger private_listing_seller_portal_task_plan_projection
after insert on public.private_listing_seller_portal_recipient_invites
for each row execute function public.bridge_project_listing_seller_portal_document_tasks();

revoke all on function public.bridge_project_listing_seller_portal_document_tasks() from public, anon, authenticated;
