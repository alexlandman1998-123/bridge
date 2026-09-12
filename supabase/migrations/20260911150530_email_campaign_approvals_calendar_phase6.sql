begin;

alter table public.email_campaigns
  add column if not exists approval_required boolean not null default false,
  add column if not exists approval_status text not null default 'not_required'
    check (approval_status in ('not_required', 'draft', 'requested', 'approved', 'changes_requested')),
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

create table if not exists public.email_campaign_approvals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  decision text not null check (decision in ('requested', 'approved', 'changes_requested')),
  comment text not null default '' check (length(comment) <= 2000),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists email_campaign_approvals_campaign_created_idx
  on public.email_campaign_approvals (campaign_id, created_at desc);
create index if not exists email_campaigns_planning_idx
  on public.email_campaigns (organisation_id, scheduled_for)
  where status in ('draft', 'scheduled');

alter table public.email_campaign_approvals enable row level security;
grant select on public.email_campaign_approvals to authenticated;
create policy email_campaign_approvals_member on public.email_campaign_approvals for select to authenticated
  using (public.bridge_has_organisation_membership(organisation_id));

-- Only this audited routine can move a campaign through approval states. The
-- author may request review; only a user already allowed to send for the
-- organisation may approve or send it back for changes.
create or replace function public.email_campaign_set_approval(
  p_campaign_id uuid,
  p_decision text,
  p_comment text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_campaign public.email_campaigns%rowtype;
begin
  select * into v_campaign from public.email_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'Campaign not found.' using errcode = 'P0002'; end if;
  if p_decision not in ('requested', 'approved', 'changes_requested') then raise exception 'Invalid approval decision.' using errcode = '22023'; end if;
  if p_decision = 'requested' then
    if not (v_campaign.created_by = auth.uid() or public.email_campaign_can_send(v_campaign.organisation_id)) then
      raise exception 'Not authorised to request approval.' using errcode = '42501';
    end if;
  elsif not public.email_campaign_can_send(v_campaign.organisation_id) then
    raise exception 'Only a sending administrator can make this decision.' using errcode = '42501';
  end if;
  if not v_campaign.approval_required then raise exception 'Approval is not required for this campaign.' using errcode = '22023'; end if;
  if v_campaign.status not in ('draft', 'scheduled') then raise exception 'Approval cannot change after sending starts.' using errcode = '22023'; end if;

  insert into public.email_campaign_approvals (organisation_id, campaign_id, decision, comment, actor_id)
  values (v_campaign.organisation_id, v_campaign.id, p_decision, left(coalesce(p_comment, ''), 2000), auth.uid());
  perform set_config('app.email_approval_transition', 'true', true);
  update public.email_campaigns set
    approval_status = p_decision,
    approval_requested_at = case when p_decision = 'requested' then now() else approval_requested_at end,
    approved_at = case when p_decision = 'approved' then now() else null end,
    approved_by = case when p_decision = 'approved' then auth.uid() else null end,
    updated_by = auth.uid()
  where id = v_campaign.id;
  return jsonb_build_object('campaign_id', v_campaign.id, 'approval_status', p_decision);
end $$;

create or replace function public.email_campaign_approval_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.approval_status := case when new.approval_required then 'draft' else 'not_required' end;
    new.approval_requested_at := null;
    new.approved_at := null;
    new.approved_by := null;
    return new;
  end if;
  if new.approval_required and old.approval_status = 'approved' and (
    new.subject is distinct from old.subject or new.preview_text is distinct from old.preview_text
    or new.html is distinct from old.html or new.audience_filter is distinct from old.audience_filter
    or new.sender_identity_id is distinct from old.sender_identity_id or new.subscription_type_id is distinct from old.subscription_type_id
  ) then
    new.approval_status := 'changes_requested';
    new.approved_at := null;
    new.approved_by := null;
  end if;
  if new.approval_status is distinct from old.approval_status
    and current_setting('app.email_approval_transition', true) is distinct from 'true'
    and not (old.approval_status = 'approved' and new.approval_status = 'changes_requested') then
    raise exception 'Approval status can only be changed through the approval workflow.' using errcode = '42501';
  end if;
  if new.status in ('scheduled', 'sending') and new.approval_required and new.approval_status <> 'approved' then
    raise exception 'This campaign requires approval before it can be scheduled.' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists email_campaign_approval_guard_trigger on public.email_campaigns;
create trigger email_campaign_approval_guard_trigger
before insert or update on public.email_campaigns
for each row execute function public.email_campaign_approval_guard();

revoke all on function public.email_campaign_set_approval(uuid, text, text) from public, anon;
grant execute on function public.email_campaign_set_approval(uuid, text, text) to authenticated;
commit;
