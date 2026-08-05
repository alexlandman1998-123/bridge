alter table if exists public.signup_intents
  drop constraint if exists signup_intents_workspace_action_check;

alter table if exists public.signup_intents
  add constraint signup_intents_workspace_action_check
  check (workspace_action in ('create_workspace', 'claim_existing_workspace', 'join_or_request_workspace', 'accept_invite', 'accept_client_access'));

create or replace function public.bridge_sync_principal_claim_signup_intent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text;
begin
  if new.invite_type <> 'principal_claim_invite' then
    return new;
  end if;

  if new.status <> 'accepted' then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.status, '') = 'accepted' then
    return new;
  end if;

  v_user_id := coalesce(new.accepted_by_user_id, new.invitee_user_id);
  v_email := lower(coalesce(new.email, ''));

  if v_user_id is null then
    return new;
  end if;

  insert into public.signup_intents (
    auth_user_id,
    email,
    app_role,
    system_role,
    workspace_type,
    workspace_kind,
    intended_org_role,
    role_contract_key,
    authority_level,
    onboarding_path,
    workspace_action,
    invite_token,
    status,
    source
  )
  values (
    v_user_id,
    v_email,
    'agent',
    'professional',
    'agency',
    'agency',
    'principal',
    'agency_owner',
    'owner_management',
    'agency_owner',
    'claim_existing_workspace',
    new.token,
    'ready_for_onboarding',
    'invite_link'
  )
  on conflict (auth_user_id) do update
  set
    email = coalesce(nullif(excluded.email, ''), public.signup_intents.email),
    app_role = excluded.app_role,
    system_role = excluded.system_role,
    workspace_type = excluded.workspace_type,
    workspace_kind = excluded.workspace_kind,
    intended_org_role = excluded.intended_org_role,
    role_contract_key = excluded.role_contract_key,
    authority_level = excluded.authority_level,
    onboarding_path = excluded.onboarding_path,
    workspace_action = excluded.workspace_action,
    invite_token = excluded.invite_token,
    status = excluded.status,
    source = excluded.source,
    consumed_at = null,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_bridge_sync_principal_claim_signup_intent on public.invites;
create trigger trg_bridge_sync_principal_claim_signup_intent
after insert or update of status on public.invites
for each row
execute function public.bridge_sync_principal_claim_signup_intent();

with accepted_principal_claims as (
  select
    i.*,
    coalesce(i.accepted_by_user_id, i.invitee_user_id) as accepted_user_id,
    lower(coalesce(i.email, '')) as invite_email
  from public.invites i
  where i.invite_type = 'principal_claim_invite'
    and i.status = 'accepted'
    and coalesce(i.accepted_by_user_id, i.invitee_user_id) is not null
)
insert into public.signup_intents (
  auth_user_id,
  email,
  app_role,
  system_role,
  workspace_type,
  workspace_kind,
  intended_org_role,
  role_contract_key,
  authority_level,
  onboarding_path,
  workspace_action,
  invite_token,
  status,
  source
)
select
  accepted_user_id,
  invite_email,
  'agent',
  'professional',
  'agency',
  'agency',
  'principal',
  'agency_owner',
  'owner_management',
  'agency_owner',
  'claim_existing_workspace',
  token,
  'ready_for_onboarding',
  'invite_link'
from accepted_principal_claims
on conflict (auth_user_id) do update
set
  email = coalesce(nullif(excluded.email, ''), public.signup_intents.email),
  app_role = excluded.app_role,
  system_role = excluded.system_role,
  workspace_type = excluded.workspace_type,
  workspace_kind = excluded.workspace_kind,
  intended_org_role = excluded.intended_org_role,
  role_contract_key = excluded.role_contract_key,
  authority_level = excluded.authority_level,
  onboarding_path = excluded.onboarding_path,
  workspace_action = excluded.workspace_action,
  invite_token = excluded.invite_token,
  status = excluded.status,
  source = excluded.source,
  consumed_at = null,
  updated_at = now();
