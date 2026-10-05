begin;

-- One operational record per matter/lane. Domain records remain authoritative;
-- this register never activates a matter or sends a communication.
create schema if not exists handoff_private;
revoke all on schema handoff_private from public, anon, authenticated;

create table public.transaction_handoffs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  owner_organisation_id uuid not null references public.organisations(id),
  role_type text not null check (role_type in ('transfer_attorney','bond_originator','bond_attorney','cancellation_attorney')),
  handoff_type text not null check (handoff_type in ('attorney_instruction','bond_application_request')),
  required boolean not null,
  destination_organisation_id uuid references public.organisations(id) on delete set null,
  destination_company_name text,
  invited_company_name text,
  invited_email text,
  roleplayer_id uuid,
  invitation_id uuid,
  invitation_expires_at timestamptz,
  nomination_status text not null check (nomination_status in ('unassigned','nominated','invited','conflicting')),
  instruction_status text not null check (instruction_status in ('not_required','awaiting_finance_owner','awaiting_buyer_onboarding','awaiting_signed_otp','ready')),
  invitation_status text not null check (invitation_status in ('not_invited','pending','accepted','declined','expired')),
  delivery_status text not null default 'not_recorded' check (delivery_status in ('not_recorded','pending','sent','failed')),
  acceptance_status text not null check (acceptance_status in ('awaiting_receipt','accepted','declined')),
  exception_keys text[] not null default '{}',
  source_references jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(transaction_id, role_type)
);
create index transaction_handoffs_owner_idx on public.transaction_handoffs(owner_organisation_id, transaction_id);
create index transaction_handoffs_destination_idx on public.transaction_handoffs(destination_organisation_id, transaction_id);
create index transaction_handoffs_exceptions_idx on public.transaction_handoffs(owner_organisation_id, updated_at)
  where required and cardinality(exception_keys)>0;
alter table public.transaction_handoffs enable row level security;
revoke all on public.transaction_handoffs from public, anon, authenticated;
grant select on public.transaction_handoffs to authenticated;
grant all on public.transaction_handoffs to service_role;
-- Use existing matter access; a nomination alone must not grant new access.
create policy transaction_handoffs_read on public.transaction_handoffs for select to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

create function handoff_private.reconcile(p_transaction_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare
  tx jsonb; lane text; needed boolean; finance_bond boolean; onboarded boolean; otp boolean;
  candidate jsonb; latest_invite jsonb; legal jsonb; candidate_count integer; legal_count integer;
  destination uuid; nominated text; instruction text; invitation_state text; acceptance text;
  issues text[]; refs jsonb; old_destination uuid; old_invitation uuid; old_roleplayer uuid;
begin
  select to_jsonb(t) into tx from public.transactions t where t.id=p_transaction_id for no key update;
  if tx is null or nullif(tx->>'organisation_id','') is null then return; end if;
  finance_bond := lower(coalesce(tx->>'finance_type','')) in ('bond','hybrid','combination');
  onboarded := nullif(tx->>'onboarding_completed_at','') is not null
    or nullif(tx->>'external_onboarding_submitted_at','') is not null
    or lower(coalesce(tx->>'onboarding_status','')) in ('submitted','reviewed','approved','complete','completed','client_onboarding_complete','buyer_submitted','awaiting_signed_otp','signed_otp_received','otp_uploaded');
  otp := lower(coalesce(tx->>'onboarding_status','')) in ('signed_otp_received','otp_uploaded');
  foreach lane in array array['transfer_attorney','bond_originator','bond_attorney','cancellation_attorney'] loop
    needed := case lane
      when 'transfer_attorney' then true
      when 'bond_originator' then finance_bond and lower(coalesce(tx->>'finance_managed_by',''))='bond_originator'
      when 'bond_attorney' then finance_bond
      else coalesce(tx->>'seller_has_existing_bond','false')='true'
        or coalesce(tx->>'existing_bond','false')='true'
        or coalesce(tx#>>'{routing_profile_json,sellerHasExistingBond}','false')='true'
        or coalesce(tx#>>'{routing_profile_json,cancellationRequired}','false')='true'
        or coalesce(tx->>'cancellation_required','false')='true'
        or coalesce(tx#>>'{routing_profile_json,requiresCancellationAttorney}','false')='true' end;
    candidate := null; latest_invite := null; legal := null; destination := null;
    issues := '{}'; refs := '{}'; acceptance := 'awaiting_receipt';
    select to_jsonb(i) into latest_invite from public.transaction_partner_invitations i
      where i.transaction_id=p_transaction_id and i.role_type=lane
      order by i.created_at desc,i.id desc limit 1;
    -- De-duplicate the invitation and its matching roleplayer. A legacy name
    -- or email alone is not proof that an organisation owns the handoff.
    with candidates as (
      select to_jsonb(r) as data, coalesce(nullif(to_jsonb(r)->>'assigned_organisation_id',''),
        nullif(to_jsonb(r)->>'partner_organisation_id',''),nullif(to_jsonb(r)->>'organisation_id','')) as org,
        lower(coalesce(to_jsonb(r)->>'email_address','')) as email
      from public.transaction_role_players r where r.transaction_id=p_transaction_id and r.role_type=lane
        and coalesce(to_jsonb(r)->>'status','') not in ('removed','cancelled','declined','rejected','inactive')
        and coalesce(to_jsonb(r)->>'assignment_status','') not in ('removed','cancelled','declined','rejected','inactive')
    ) select count(distinct coalesce(org,nullif(email,''),'unresolved:'||(data->>'id'))),
        (jsonb_agg(data order by data->>'updated_at' desc nulls last,data->>'id' desc))->0
      into candidate_count,candidate from candidates;
    if candidate is not null then
      destination := coalesce(nullif(candidate->>'assigned_organisation_id',''),nullif(candidate->>'partner_organisation_id',''),nullif(candidate->>'organisation_id',''))::uuid;
      refs := refs || jsonb_build_object('roleplayerId',candidate->>'id');
    end if;
    invitation_state := coalesce(latest_invite->>'status','not_invited');
    if invitation_state='pending' and (latest_invite->>'expires_at')::timestamptz<=now() then invitation_state:='expired'; end if;
    if latest_invite is not null then
      refs := refs || jsonb_build_object('invitationId',latest_invite->>'id');
      if candidate is not null and invitation_state in ('pending','accepted')
        and (candidate->>'transaction_partner_invitation_id') is distinct from (latest_invite->>'id')
        and ((destination is not null and nullif(latest_invite->>'organisation_id','') is not null
              and destination::text is distinct from latest_invite->>'organisation_id')
          or (lower(coalesce(candidate->>'email_address','')) <> lower(coalesce(latest_invite->>'email',''))
            and (destination is null or destination::text is distinct from latest_invite->>'organisation_id'))) then
        candidate_count := candidate_count+1;
      end if;
      if candidate is null and invitation_state='accepted' then
        destination := nullif(latest_invite->>'organisation_id','')::uuid;
      end if;
    end if;
    if candidate is null and latest_invite is null and lane='bond_originator' then
      destination := nullif(tx->>'bond_workspace_id','')::uuid;
    end if;
    if lane='bond_originator' and destination is not null and nullif(tx->>'bond_workspace_id','') is not null
      and destination::text is distinct from tx->>'bond_workspace_id' then
      candidate_count:=greatest(candidate_count,1)+1;
    end if;
    if lane='bond_originator' and destination::text=tx->>'bond_workspace_id' then
      if tx->>'bond_assignment_source' in ('accepted_from_intake','assigned_from_intake')
        and tx->>'bond_assignment_status' in ('consultant_assigned','fully_assigned','accepted') then
        acceptance:='accepted'; refs:=refs||jsonb_build_object('bondReceiptSource',tx->>'bond_assignment_source');
      elsif tx->>'bond_assignment_source'='declined_from_intake' then acceptance:='declined'; end if;
    end if;
    if lane<>'bond_originator' then
      select to_jsonb(a)||jsonb_build_object('destinationOrganisationId',f.organisation_id) into legal
      from public.transaction_attorney_assignments a
      left join public.attorney_firms f on f.id=coalesce(nullif(to_jsonb(a)->>'attorney_firm_id',''),nullif(to_jsonb(a)->>'firm_id',''))::uuid
      where a.transaction_id=p_transaction_id and (
        to_jsonb(a)->>'attorney_role'=lane or (lane='transfer_attorney' and to_jsonb(a)->>'assignment_type' in ('transfer','transfer_and_bond')))
        and coalesce(to_jsonb(a)->>'assignment_status',to_jsonb(a)->>'status','') not in ('removed','cancelled')
      order by a.updated_at desc,a.id desc limit 1;
      select count(distinct f.organisation_id) into legal_count
      from public.transaction_attorney_assignments a
      join public.attorney_firms f on f.id=coalesce(nullif(to_jsonb(a)->>'attorney_firm_id',''),nullif(to_jsonb(a)->>'firm_id',''))::uuid
      where a.transaction_id=p_transaction_id and (
        to_jsonb(a)->>'attorney_role'=lane or (lane='transfer_attorney' and to_jsonb(a)->>'assignment_type' in ('transfer','transfer_and_bond')))
        and coalesce(to_jsonb(a)->>'assignment_status',to_jsonb(a)->>'status','') not in ('removed','completed','cancelled');
      candidate_count:=greatest(candidate_count,legal_count);
      if legal is not null then
        if destination is not null and nullif(legal->>'destinationOrganisationId','') is not null
          and destination::text is distinct from legal->>'destinationOrganisationId' then
          candidate_count:=candidate_count+1;
        end if;
        refs := refs||jsonb_build_object('attorneyAssignmentId',legal->>'id');
        if destination is null and candidate is null and latest_invite is null then destination:=nullif(legal->>'destinationOrganisationId','')::uuid; end if;
        if destination is not null and destination::text=legal->>'destinationOrganisationId' then
          if legal->>'firm_acceptance_status'='accepted' then acceptance:='accepted';
          elsif legal->>'firm_acceptance_status'='declined' or legal->>'instruction_status'='declined' then acceptance:='declined'; end if;
        end if;
      end if;
    end if;
    -- Legacy nominations can contain a stale workspace identifier. Preserve
    -- that reference as an exception instead of aborting the entire backfill.
    if destination is not null and not exists (select 1 from public.organisations o where o.id=destination) then
      refs:=refs||jsonb_build_object('unresolvedOrganisationId',destination);
      destination:=null; acceptance:='awaiting_receipt';
      if needed then issues:=array_append(issues,'organisation_unresolved'); end if;
    end if;
    nominated := case when candidate_count>1 then 'conflicting' when destination is not null then 'nominated'
      when latest_invite is not null then 'invited' else 'unassigned' end;
    instruction := case when not needed then 'not_required' when otp then 'ready'
      when onboarded then 'awaiting_signed_otp' else 'awaiting_buyer_onboarding' end;
    if needed then
      if candidate_count>1 then issues:=array_append(issues,'conflicting_destinations'); end if;
      if destination is null and latest_invite is null then issues:=array_append(issues,'destination_missing'); end if;
      if destination is null and candidate is not null and latest_invite is null
        and not ('organisation_unresolved'=any(issues)) then issues:=array_append(issues,'organisation_unresolved'); end if;
      if invitation_state in ('expired','declined') then issues:=array_append(issues,'invitation_'||invitation_state); end if;
      if invitation_state='accepted' and destination is null then issues:=array_append(issues,'accepted_invitation_not_bound'); end if;
      if acceptance='declined' then issues:=array_append(issues,'organisation_declined'); end if;
    end if;
    -- Unknown finance ownership is an exception, never an automatic originator instruction.
    if lane='bond_originator' and finance_bond and nullif(tx->>'finance_managed_by','') is null then
      needed:=true; instruction:='awaiting_finance_owner'; issues:=array_append(issues,'finance_owner_unresolved');
    end if;
    select destination_organisation_id,invitation_id,roleplayer_id into old_destination,old_invitation,old_roleplayer
      from public.transaction_handoffs where transaction_id=p_transaction_id and role_type=lane;
    insert into public.transaction_handoffs(transaction_id,owner_organisation_id,role_type,handoff_type,required,
      destination_organisation_id,destination_company_name,invited_company_name,invited_email,roleplayer_id,invitation_id,invitation_expires_at,
      nomination_status,instruction_status,invitation_status,acceptance_status,exception_keys,source_references)
    values(p_transaction_id,(tx->>'organisation_id')::uuid,lane,
      case when lane='bond_originator' then 'bond_application_request' else 'attorney_instruction' end,needed,
      destination,(select coalesce(to_jsonb(o)->>'name',to_jsonb(o)->>'company_name') from public.organisations o where o.id=destination),latest_invite->>'company_name',latest_invite->>'email',(candidate->>'id')::uuid,(latest_invite->>'id')::uuid,(latest_invite->>'expires_at')::timestamptz,
      nominated,instruction,invitation_state,acceptance,issues,refs)
    on conflict(transaction_id,role_type) do update set
      owner_organisation_id=excluded.owner_organisation_id,required=excluded.required,
      destination_organisation_id=excluded.destination_organisation_id,
      destination_company_name=excluded.destination_company_name,
      invited_company_name=excluded.invited_company_name,invited_email=excluded.invited_email,
      roleplayer_id=excluded.roleplayer_id,invitation_id=excluded.invitation_id,
      invitation_expires_at=excluded.invitation_expires_at,
      nomination_status=excluded.nomination_status,instruction_status=excluded.instruction_status,
      invitation_status=excluded.invitation_status,acceptance_status=excluded.acceptance_status,
      exception_keys=excluded.exception_keys,source_references=excluded.source_references,
      delivery_status=case when old_destination is distinct from excluded.destination_organisation_id
        or old_invitation is distinct from excluded.invitation_id or old_roleplayer is distinct from excluded.roleplayer_id
        then 'not_recorded' else public.transaction_handoffs.delivery_status end,
      updated_at=now();
  end loop;
end $$;
revoke all on function handoff_private.reconcile(uuid) from public,anon,authenticated;

create function handoff_private.source_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous_id uuid; current_id uuid;
begin
  if tg_table_name='transactions' and tg_op='UPDATE' then
    if not exists (select 1 from unnest(array['organisation_id','finance_type','finance_managed_by',
      'onboarding_status','onboarding_completed_at','external_onboarding_submitted_at','bond_workspace_id',
      'bond_assignment_status','bond_assignment_source','seller_has_existing_bond','existing_bond',
      'cancellation_required','routing_profile_json']) as fields(key)
      where to_jsonb(old)->fields.key is distinct from to_jsonb(new)->fields.key) then return null; end if;
  end if;
  if tg_op<>'INSERT' then previous_id:=(to_jsonb(old)->>case when tg_table_name='transactions' then 'id' else 'transaction_id' end)::uuid; end if;
  if tg_op<>'DELETE' then current_id:=(to_jsonb(new)->>case when tg_table_name='transactions' then 'id' else 'transaction_id' end)::uuid; end if;
  if previous_id is not null and previous_id is distinct from current_id then perform handoff_private.reconcile(previous_id); end if;
  if current_id is not null then perform handoff_private.reconcile(current_id); end if;
  return null;
end $$;
revoke all on function handoff_private.source_changed() from public,anon,authenticated;
create trigger handoff_register_transaction after insert or update on public.transactions
  for each row execute function handoff_private.source_changed();
create trigger handoff_register_roleplayer after insert or update or delete on public.transaction_role_players
  for each row execute function handoff_private.source_changed();
create trigger handoff_register_invitation after insert or update or delete on public.transaction_partner_invitations
  for each row execute function handoff_private.source_changed();
create trigger handoff_register_attorney after insert or update or delete on public.transaction_attorney_assignments
  for each row execute function handoff_private.source_changed();

-- Expiry is evaluated at read time too, so a link cannot appear current merely
-- because no source row has changed since its expiry date.
create function public.bridge_read_transaction_handoffs(p_transaction_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version','transaction_handoff_register_v1','items',coalesce(jsonb_agg(
    to_jsonb(h)||case when h.invitation_status='pending' and h.invitation_expires_at<=now() then
      jsonb_build_object('invitation_status','expired','exception_keys',to_jsonb(h.exception_keys||array['invitation_expired']))
      else '{}'::jsonb end order by h.role_type),'[]'::jsonb))
  from public.transaction_handoffs h
  where h.transaction_id=p_transaction_id;
$$;
revoke all on function public.bridge_read_transaction_handoffs(uuid) from public,anon;
grant execute on function public.bridge_read_transaction_handoffs(uuid) to authenticated;
do $$ declare matter record; begin
  for matter in select id from public.transactions where organisation_id is not null loop
    perform handoff_private.reconcile(matter.id);
  end loop;
end $$;
comment on table public.transaction_handoffs is 'Organisation handoff register: nomination and readiness are independent from delivery and acceptance. Source references contain no bearer tokens.';
notify pgrst,'reload schema';
commit;
