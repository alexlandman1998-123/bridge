begin;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"33658166-c21f-4174-8b0d-ebbb2e36384b","role":"authenticated"}',true);
do $smoke$
declare org uuid := '13c6b79f-1d8b-4886-aabf-42ea49565ef5'; member uuid := '6dcf144d-d4d9-4738-9ea4-3dd7f2de4b91'; branch uuid; template uuid; result jsonb;
begin
  perform public.bridge_set_organisation_user_role(member,'agent');
  if not public.bridge_agency_open_operations(org) then raise exception 'ordinary agent access denied'; end if;
  insert into public.organisation_branches(organisation_id,name) values(org,'QA rollback agency 20260913') returning id into branch;
  update public.organisation_branches set manager_name='QA rollback' where id=branch;
  update public.organisation_users set branch_id=branch,primary_branch_id=branch where id=member;
  update public.organisation_users set branch_id='9b5e684e-7735-4df0-95d4-dfa2a4e1f690',primary_branch_id='9b5e684e-7735-4df0-95d4-dfa2a4e1f690' where id=member;
  delete from public.organisation_branches where id=branch;
  insert into public.organisation_commission_structures(organisation_id,name,listing_commission_percentage) values(org,'QA rollback agency 20260913',5) returning id into template;
  update public.organisation_commission_structures set agent_split_percentage=64,agency_split_percentage=36 where id=template;
  delete from public.organisation_commission_structures where id=template;
  result := public.bridge_save_organisation_partner(p_organisation_id=>org,p_role_type=>'referral_agency',p_company_name=>'QA rollback agency 20260913',p_is_preferred_default=>false);
  if not (result->>'success')::boolean then raise exception 'referral agency save failed'; end if;
  result := public.bridge_grant_organisation_owner(member,false);
  if result#>>'{owner,role}' <> 'owner' then raise exception 'self claim failed'; end if;
  perform public.bridge_grant_organisation_owner('c9115e69-72f6-4e7a-90bd-18ff95f98096',false);
  result := public.bridge_transfer_organisation_ownership(member);
  if not (result#>>'{newOwner,is_primary_owner}')::boolean then raise exception 'primary claim failed'; end if;
  if (select count(*) from public.organisation_users where organisation_id=org and role='owner') < 2 then raise exception 'shared owners not retained'; end if;
end $smoke$;
select 'PASS: ordinary-agent branch CRUD, agent reassignment, commission CRUD, referral agency, claim/share/primary ownership; all rolled back' as result;
rollback;
