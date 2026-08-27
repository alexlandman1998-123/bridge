begin;

create or replace function public.bridge_normalize_transaction_participant_assignment_source()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_source text := lower(nullif(trim(coalesce(new.assignment_source, '')), ''));
begin
  new.assignment_source := case
    when v_source in (
      'transaction_direct',
      'development_default',
      'system_inherited',
      'reference_only'
    ) then v_source
    when v_source in (
      'agent_firm_nomination',
      'attorney_assignment',
      'dalawyer_demo_seed',
      'manual',
      'partner_invitation',
      'stakeholder_add',
      'transaction_partner_invitation',
      'workflow_assignment'
    ) then 'transaction_direct'
    when v_source in (
      'phase6_person_routing_sync',
      'routing_rule',
      'system',
      'transaction_roleplayer_propagation'
    ) then 'system_inherited'
    else 'transaction_direct'
  end;

  return new;
end;
$$;

drop trigger if exists bridge_normalize_transaction_participant_assignment_source
  on public.transaction_participants;

create trigger bridge_normalize_transaction_participant_assignment_source
before insert or update of assignment_source
on public.transaction_participants
for each row
execute function public.bridge_normalize_transaction_participant_assignment_source();

update public.transaction_participants
set assignment_source = case
  when lower(nullif(trim(coalesce(assignment_source, '')), '')) in (
    'transaction_direct',
    'development_default',
    'system_inherited',
    'reference_only'
  ) then lower(nullif(trim(coalesce(assignment_source, '')), ''))
  when lower(nullif(trim(coalesce(assignment_source, '')), '')) in (
    'agent_firm_nomination',
    'attorney_assignment',
    'dalawyer_demo_seed',
    'manual',
    'partner_invitation',
    'stakeholder_add',
    'transaction_partner_invitation',
    'workflow_assignment'
  ) then 'transaction_direct'
  when lower(nullif(trim(coalesce(assignment_source, '')), '')) in (
    'phase6_person_routing_sync',
    'routing_rule',
    'system',
    'transaction_roleplayer_propagation'
  ) then 'system_inherited'
  else 'transaction_direct'
end
where assignment_source is null
   or lower(nullif(trim(coalesce(assignment_source, '')), '')) not in (
    'transaction_direct',
    'development_default',
    'system_inherited',
    'reference_only'
   )
   or assignment_source <> lower(nullif(trim(coalesce(assignment_source, '')), ''));

alter table if exists public.transaction_participants
  drop constraint if exists transaction_participants_assignment_source_check;

alter table if exists public.transaction_participants
  add constraint transaction_participants_assignment_source_check
  check (
    assignment_source in (
      'transaction_direct',
      'development_default',
      'system_inherited',
      'reference_only'
    )
  );

comment on function public.bridge_normalize_transaction_participant_assignment_source()
  is 'Normalizes legacy transaction participant assignment source labels before the canonical check constraint runs.';

revoke all on function public.bridge_normalize_transaction_participant_assignment_source()
  from public, anon, authenticated;

commit;
