begin;
-- A separately approved manual Trusts setup pilot. No conveyancing changes.
create table legal_private.trust_pilots (
 firm_id uuid primary key references public.attorney_firms(id),
 enabled boolean not null default false, template_version text not null check(template_version='trust_setup_manual_v1'),
 review_note text not null check(length(btrim(review_note)) between 1 and 3000),
 reviewed_by uuid not null references auth.users(id), reviewed_at timestamptz not null default now(), revision bigint not null default 1
);
alter table legal_private.trust_pilots enable row level security;
revoke all on legal_private.trust_pilots from public,anon,authenticated;
create function legal_private.trust_pilot_read(p_firm uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not legal_private.allowed(p_firm,'trusts') then raise exception 'Trusts access denied' using errcode='42501';end if;
 return jsonb_build_object('settings',(select to_jsonb(s) from legal_private.trust_pilots s where s.firm_id=p_firm),
 'template_version','trust_setup_manual_v1','tasks',jsonb_build_array('Record trust setup instructions','Identify parties and authority','Review deed and supporting evidence','Record professional review','Record setup outcome and handover'),
 'can_configure',legal_private.allowed(p_firm,'trusts','manage') and legal_private.allowed(p_firm,'trusts','review'));
end $$;
create function legal_private.trust_pilot_command(p_firm uuid,p_request uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();m legal_private.matters;w legal_private.work_state;saved legal_private.receipts;
 result jsonb;keys text[];before jsonb;item jsonb;position integer:=0;
begin
 if p_request is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid command' using errcode='22023';end if;
 keys:=case p_action when 'configure_trusts' then array['enabled','template_version','review_note','expected_revision']
 when 'start_trusts' then array['matter_id','expected_revision','template_version']
 when 'save_trust_dates' then array['matter_id','expected_revision','dates'] else null end;
 if keys is null or exists(select 1 from jsonb_object_keys(p_payload) k where not(k=any(keys))) then raise exception 'Unsupported Trusts command' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_firm::text,912));
 if p_action='configure_trusts' then
 if not legal_private.allowed(p_firm,'trusts','manage') or not legal_private.allowed(p_firm,'trusts','review') then raise exception 'Firm reviewer required' using errcode='42501';end if;
 else
 select * into m from legal_private.matters where id=(p_payload->>'matter_id')::uuid and firm_id=p_firm for update;
 if not found or m.discipline<>'trusts' or not legal_private.matter_access(m.id,'edit') or not legal_private.work_enabled(p_firm,'tasks') then raise exception 'Trusts matter access denied' using errcode='42501';end if;
 end if;
 select * into saved from legal_private.receipts where firm_id=p_firm and actor_id=actor and request_id=p_request;
 if found then
 if saved.action<>p_action or saved.payload<>p_payload then raise exception 'Request identity reused' using errcode='22023';end if;
 return saved.result||jsonb_build_object('deduplicated',true);
 end if;
 if p_action='configure_trusts' then
 if (p_payload->>'expected_revision')::bigint is distinct from coalesce((select revision from legal_private.trust_pilots where firm_id=p_firm),0) then raise exception 'Pilot settings changed' using errcode='40001';end if;
 if p_payload->>'template_version' is distinct from 'trust_setup_manual_v1' or jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' or jsonb_typeof(p_payload->'review_note') is distinct from 'string' then raise exception 'Invalid pilot approval' using errcode='22023';end if;
 before:=(select to_jsonb(s) from legal_private.trust_pilots s where firm_id=p_firm);
 insert into legal_private.trust_pilots(firm_id,enabled,template_version,review_note,reviewed_by)
 values(p_firm,(p_payload->>'enabled')::boolean,p_payload->>'template_version',p_payload->>'review_note',actor)
 on conflict(firm_id) do update set enabled=excluded.enabled,review_note=excluded.review_note,reviewed_by=actor,reviewed_at=now(),revision=legal_private.trust_pilots.revision+1;
 result:=jsonb_build_object('settings',(select to_jsonb(s) from legal_private.trust_pilots s where firm_id=p_firm));
 else
 if m.status in ('closed','archived') then raise exception 'Reopen the matter before changing work' using errcode='22023';end if;
 insert into legal_private.work_state(firm_id,matter_id) values(p_firm,m.id) on conflict do nothing;
 select * into w from legal_private.work_state where matter_id=m.id for update;
 if (p_payload->>'expected_revision')::bigint is distinct from w.revision then raise exception 'Work changed. Reload before saving' using errcode='40001';end if;
 before:=to_jsonb(w);
 if p_action='start_trusts' then
 if w.template_version is not null or p_payload->>'template_version' is distinct from 'trust_setup_manual_v1' then raise exception 'Checklist unavailable or already started' using errcode='22023';end if;
 if not exists(select 1 from legal_private.trust_pilots s where s.firm_id=p_firm and s.enabled and s.template_version=p_payload->>'template_version') then raise exception 'Firm approval required before starting' using errcode='42501';end if;
 if not exists(select 1 from public.attorney_firm_members a join legal_private.capabilities g on g.firm_id=a.firm_id and g.user_id=a.user_id where a.firm_id=p_firm and a.user_id=m.responsible_user_id and a.status='active' and g.can_edit and ('trusts'=any(g.disciplines) or(g.can_manage and coalesce(a.professional_role,a.role) in ('firm_admin','director_partner')))) then raise exception 'Assign an active responsible attorney' using errcode='22023';end if;
 select coalesce(max(sort_order),0) into position from legal_private.tasks where matter_id=m.id;
 for item in select value from jsonb_array_elements(legal_private.trust_pilot_read(p_firm)->'tasks') loop
 position:=position+1;insert into legal_private.tasks(firm_id,matter_id,title,owner_id,sort_order) values(p_firm,m.id,item#>>'{}',m.responsible_user_id,position);end loop;
 update legal_private.work_state set template_version='trust_setup_manual_v1' where matter_id=m.id;
 else
 if jsonb_typeof(p_payload->'dates') is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_payload->'dates') k where k not in ('instructions_on','review_on','setup_on','handover_on','execution_on','custody_on')) then raise exception 'Invalid Trusts dates' using errcode='22023';end if;
 for item in select value from jsonb_each(p_payload->'dates') loop
 if item<>'null'::jsonb and (jsonb_typeof(item)<>'string' or item#>>'{}' !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'Invalid date' using errcode='22023';end if;
 if item<>'null'::jsonb then perform (item#>>'{}')::date;end if;
 end loop;
 update legal_private.work_state set dates=p_payload->'dates' where matter_id=m.id;
 end if;
 update legal_private.work_state set revision=revision+1 where matter_id=m.id;
 result:=legal_private.work_read(p_firm,m.id);
 end if;
 insert into legal_private.events(firm_id,matter_id,actor_id,action,request_id,details) values(p_firm,m.id,actor,p_action,p_request,jsonb_build_object('input',p_payload,'before',before,'result',result));
 insert into legal_private.receipts values(p_firm,actor,p_request,p_action,p_payload,result);
 return result||jsonb_build_object('deduplicated',false);
end $$;
create function public.arch9_legal_trust_pilot_read(p_firm_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select legal_private.trust_pilot_read(p_firm_id)$$;
create function public.arch9_legal_trust_pilot_command(p_firm_id uuid,p_request_id uuid,p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select legal_private.trust_pilot_command(p_firm_id,p_request_id,p_action,p_payload)$$;
revoke all on function legal_private.trust_pilot_read(uuid),legal_private.trust_pilot_command(uuid,uuid,text,jsonb),public.arch9_legal_trust_pilot_read(uuid),public.arch9_legal_trust_pilot_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function legal_private.trust_pilot_read(uuid),legal_private.trust_pilot_command(uuid,uuid,text,jsonb),public.arch9_legal_trust_pilot_read(uuid),public.arch9_legal_trust_pilot_command(uuid,uuid,text,jsonb) to authenticated;
commit;
