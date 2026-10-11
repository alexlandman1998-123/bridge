begin;
-- Isolated manual Legal work. No transaction, appointment, email or signing adapters.
create table legal_private.work_features (
 firm_id uuid primary key references public.attorney_firms(id),
 tasks_enabled boolean not null default true, documents_enabled boolean not null default true,
 revision bigint not null default 1
);
create table legal_private.work_state (
 firm_id uuid not null, matter_id uuid primary key, revision bigint not null default 0,
 dates jsonb not null default '{}', template_version text,
 foreign key(firm_id,matter_id) references legal_private.matters(firm_id,id)
);
create table legal_private.tasks (
 id uuid primary key default gen_random_uuid(),firm_id uuid not null,matter_id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 200),owner_id uuid not null references auth.users(id),
 sort_order integer not null default 0,due_on date,status text not null default 'pending' check(status in ('pending','complete')),
 note text not null default '' check(length(note)<=3000),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(firm_id,matter_id) references legal_private.matters(firm_id,id)
);
create index legal_tasks_matter_idx on legal_private.tasks(matter_id,sort_order,created_at,id);
create table legal_private.documents (
 id uuid primary key default gen_random_uuid(),firm_id uuid not null,matter_id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 200),current_version integer not null default 0,
 foreign key(firm_id,matter_id) references legal_private.matters(firm_id,id),unique(firm_id,matter_id,id)
);
create index legal_documents_matter_idx on legal_private.documents(matter_id,title,id);
create table legal_private.document_versions (
 id uuid primary key default gen_random_uuid(),firm_id uuid not null,matter_id uuid not null,document_id uuid not null,
 version_no integer not null check(version_no>0),path text not null unique,filename text not null check(length(filename) between 1 and 200),
 mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 byte_size bigint not null check(byte_size between 1 and 6291456),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 state text not null default 'pending' check(state in ('pending','ready','cancelled')),uploaded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),committed_at timestamptz,
 foreign key(firm_id,matter_id,document_id) references legal_private.documents(firm_id,matter_id,id)
);
create unique index legal_document_ready_version_idx on legal_private.document_versions(document_id,version_no) where state='ready';
create index legal_document_versions_matter_idx on legal_private.document_versions(matter_id,state,created_at);
do $$ declare t text;begin
 foreach t in array array['work_features','work_state','tasks','documents','document_versions'] loop
 execute format('alter table legal_private.%I enable row level security',t);
 execute format('revoke all on legal_private.%I from public,anon,authenticated',t);
 end loop;
end $$;
create function legal_private.work_enabled(p_firm uuid,p_feature text) returns boolean
language sql stable security definer set search_path='' as $$
 select legal_private.allowed(p_firm) and case p_feature when 'tasks' then
 coalesce((select tasks_enabled from legal_private.work_features where firm_id=p_firm),true)
 when 'documents' then coalesce((select documents_enabled from legal_private.work_features where firm_id=p_firm),true) else false end
$$;
create function legal_private.work_read(p_firm uuid,p_matter uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from legal_private.matters where id=p_matter and firm_id=p_firm)
 or not legal_private.matter_access(p_matter) then raise exception 'Legal matter access denied' using errcode='42501';end if;
 return jsonb_build_object('tasks_enabled',legal_private.work_enabled(p_firm,'tasks'),'documents_enabled',legal_private.work_enabled(p_firm,'documents'),
 'work',case when legal_private.work_enabled(p_firm,'tasks') then coalesce((select to_jsonb(w) from legal_private.work_state w where matter_id=p_matter),jsonb_build_object('revision',0,'dates','{}'::jsonb,'template_version',null)) else null end,
 'tasks',case when legal_private.work_enabled(p_firm,'tasks') then (select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order,t.created_at,t.id),'[]') from legal_private.tasks t where matter_id=p_matter) else '[]'::jsonb end,
 'documents',case when legal_private.work_enabled(p_firm,'documents') then (select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('versions',
 (select coalesce(jsonb_agg(to_jsonb(v) order by v.version_no desc),'[]') from legal_private.document_versions v where v.document_id=d.id and v.state='ready')) order by d.title,d.id),'[]') from legal_private.documents d where d.matter_id=p_matter and d.current_version>0) else '[]'::jsonb end,
 'pending_uploads',case when legal_private.work_enabled(p_firm,'documents') then (select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('title',d.title) order by v.created_at),'[]') from legal_private.document_versions v join legal_private.documents d on d.id=v.document_id where v.matter_id=p_matter and v.state='pending' and v.uploaded_by=auth.uid()) else '[]'::jsonb end);
end $$;
create function legal_private.work_command(p_firm uuid,p_request uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();m legal_private.matters;saved legal_private.receipts;w legal_private.work_state;
 t legal_private.tasks;d legal_private.documents;v legal_private.document_versions;result jsonb;keys text[];target uuid;person uuid;item jsonb;before jsonb;v_dates jsonb;position integer:=0;
begin
 if actor is null or p_request is null or not legal_private.allowed(p_firm) then raise exception 'Legal access denied' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32768 then raise exception 'Invalid work payload' using errcode='22023';end if;
 keys:=case p_action
 when 'configure_work' then array['tasks_enabled','documents_enabled','expected_revision']
 when 'start_wills' then array['matter_id','expected_revision']
 when 'save_task' then array['matter_id','expected_revision','task_id','title','owner_id','due_on','status','note']
 when 'save_dates' then array['matter_id','expected_revision','dates']
 when 'reserve_document' then array['matter_id','document_id','expected_version','title','filename','mime_type','byte_size','sha256']
 when 'commit_document' then array['matter_id','version_id']
 when 'cancel_document' then array['matter_id','version_id'] end;
 if keys is null or exists(select 1 from jsonb_object_keys(p_payload) k where not k=any(keys)) then raise exception 'Unsupported work command field' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_firm::text,912));
 if p_action='configure_work' then
 if not legal_private.allowed(p_firm,null,'manage') then raise exception 'Legal management required' using errcode='42501';end if;
 else
 select * into m from legal_private.matters where id=(p_payload->>'matter_id')::uuid and firm_id=p_firm for update;
 if not found or not legal_private.matter_access(m.id,'edit') then raise exception 'Legal matter edit denied' using errcode='42501';end if;
 if not legal_private.work_enabled(p_firm,case when p_action in ('start_wills','save_task','save_dates') then 'tasks' else 'documents' end) then raise exception 'Legal capability disabled' using errcode='42501';end if;
 end if;
 select * into saved from legal_private.receipts where firm_id=p_firm and actor_id=actor and request_id=p_request;
 if found then
 if saved.action<>'work_'||p_action or saved.payload<>p_payload then raise exception 'Request identity reused' using errcode='22023';end if;
 return saved.result||jsonb_build_object('deduplicated',true);
 end if;
 if m.id is not null and m.status in ('closed','archived') and p_action<>'cancel_document' then raise exception 'Reopen the matter before changing work' using errcode='22023';end if;
 if p_action='configure_work' then
 if (p_payload->>'expected_revision')::bigint is distinct from coalesce((select revision from legal_private.work_features where firm_id=p_firm),0) then raise exception 'Work settings changed' using errcode='40001';end if;
 insert into legal_private.work_features(firm_id,tasks_enabled,documents_enabled) values(p_firm,(p_payload->>'tasks_enabled')::boolean,(p_payload->>'documents_enabled')::boolean)
 on conflict(firm_id) do update set tasks_enabled=excluded.tasks_enabled,documents_enabled=excluded.documents_enabled,revision=legal_private.work_features.revision+1;
 result:=jsonb_build_object('settings',(select to_jsonb(f) from legal_private.work_features f where firm_id=p_firm));
 elsif p_action in ('start_wills','save_task','save_dates') then
 insert into legal_private.work_state(firm_id,matter_id) values(p_firm,m.id) on conflict do nothing;
 select * into w from legal_private.work_state where matter_id=m.id for update;
 if (p_payload->>'expected_revision')::bigint is distinct from w.revision then raise exception 'Work changed. Reload before saving' using errcode='40001';end if;
 if p_action='start_wills' then
 if m.discipline<>'wills_estates' or w.template_version is not null then raise exception 'Wills checklist unavailable or already started' using errcode='22023';end if;
 if not exists(select 1 from public.attorney_firm_members a join legal_private.capabilities g on g.firm_id=a.firm_id and g.user_id=a.user_id where a.firm_id=p_firm and a.user_id=m.responsible_user_id and a.status='active' and g.can_edit and (m.discipline=any(g.disciplines) or(g.can_manage and coalesce(a.professional_role,a.role) in ('firm_admin','director_partner')))) then raise exception 'Assign an active responsible attorney before starting' using errcode='22023';end if;
 for item in select value from jsonb_array_elements('["Record instructions","Draft and review will","Record execution evidence","Record original custody"]'::jsonb) loop
 position:=position+1;insert into legal_private.tasks(firm_id,matter_id,title,owner_id,sort_order) values(p_firm,m.id,item#>>'{}',m.responsible_user_id,position);end loop;
 update legal_private.work_state set template_version='wills_manual_v1' where matter_id=m.id;
 elsif p_action='save_dates' then
 before:=to_jsonb(w);v_dates:=p_payload->'dates';
 if jsonb_typeof(v_dates) is distinct from 'object' or exists(select 1 from jsonb_object_keys(v_dates) k where k not in ('instructions_on','review_on','execution_on','custody_on')) then raise exception 'Invalid matter dates' using errcode='22023';end if;
 for item in select value from jsonb_each(v_dates) loop
 if item<>'null'::jsonb then
 if jsonb_typeof(item)<>'string' or (item#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Use a SAST calendar date' using errcode='22023';end if;
 perform (item#>>'{}')::date;
 end if;end loop;
 update legal_private.work_state set dates=v_dates where matter_id=m.id;
 else
 select * into t from legal_private.tasks where id=(p_payload->>'task_id')::uuid and matter_id=m.id for update;
 if p_payload ? 'task_id' and not found then raise exception 'Task does not belong to matter' using errcode='42501';end if;
 before:=case when t.id is null then null else to_jsonb(t) end;
 person:=(p_payload->>'owner_id')::uuid;
 if not exists(select 1 from legal_private.team team join public.attorney_firm_members a on a.firm_id=team.firm_id and a.user_id=team.user_id join legal_private.capabilities g on g.firm_id=a.firm_id and g.user_id=a.user_id
 where team.matter_id=m.id and team.user_id=person and team.removed_at is null and a.status='active' and g.can_edit and (m.discipline=any(g.disciplines) or(g.can_manage and coalesce(a.professional_role,a.role) in ('firm_admin','director_partner')))) then raise exception 'Choose an active matter team owner' using errcode='22023';end if;
 if ((t.id is null and p_payload->>'status'='complete') or (t.id is not null and t.status is distinct from p_payload->>'status')) and length(btrim(coalesce(p_payload->>'note','')))=0 then raise exception 'Record a completion or reopen note' using errcode='22023';end if;
 if nullif(p_payload->>'due_on','') is not null and (p_payload->>'due_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Use a SAST calendar date' using errcode='22023';end if;
 target:=coalesce(t.id,gen_random_uuid());
 insert into legal_private.tasks(id,firm_id,matter_id,title,owner_id,sort_order,due_on,status,note) values(target,p_firm,m.id,btrim(p_payload->>'title'),person,(select coalesce(max(sort_order),0)+1 from legal_private.tasks where matter_id=m.id),nullif(p_payload->>'due_on','')::date,p_payload->>'status',coalesce(p_payload->>'note',''))
 on conflict(id) do update set title=excluded.title,owner_id=excluded.owner_id,due_on=excluded.due_on,status=excluded.status,note=excluded.note,updated_at=now();
 end if;
 update legal_private.work_state set revision=revision+1 where matter_id=m.id returning * into w;
 result:=jsonb_build_object('work',to_jsonb(w),'task',case when target is null then null else (select to_jsonb(task) from legal_private.tasks task where id=target) end);
 elsif p_action='reserve_document' then
 if p_payload ? 'document_id' then
 select * into d from legal_private.documents where id=(p_payload->>'document_id')::uuid and matter_id=m.id and firm_id=p_firm for update;
 if not found then raise exception 'Document does not belong to matter' using errcode='42501';end if;
 else
 insert into legal_private.documents(firm_id,matter_id,title) values(p_firm,m.id,btrim(p_payload->>'title')) returning * into d;
 end if;
 if (p_payload->>'expected_version')::integer is distinct from d.current_version then raise exception 'Document version changed' using errcode='40001';end if;
 target:=gen_random_uuid();
 insert into legal_private.document_versions(id,firm_id,matter_id,document_id,version_no,path,filename,mime_type,byte_size,sha256,uploaded_by)
 values(target,p_firm,m.id,d.id,d.current_version+1,p_firm::text||'/'||m.id::text||'/'||target::text,btrim(p_payload->>'filename'),p_payload->>'mime_type',(p_payload->>'byte_size')::bigint,p_payload->>'sha256',actor) returning * into v;
 result:=jsonb_build_object('version',to_jsonb(v));
 else
 select * into v from legal_private.document_versions where id=(p_payload->>'version_id')::uuid and matter_id=m.id and firm_id=p_firm for update;
 if not found or v.uploaded_by<>actor then raise exception 'Upload access denied' using errcode='42501';end if;
 if v.state<>'pending' then raise exception 'Upload is no longer pending' using errcode='22023';end if;
 if p_action='cancel_document' then
 update legal_private.document_versions set state='cancelled' where id=v.id returning * into v;
 else
 select * into d from legal_private.documents where id=v.document_id for update;
 if d.current_version<>v.version_no-1 then raise exception 'Document version changed. Cancel and start a replacement' using errcode='40001';end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='arch9-legal-matters' and o.name=v.path
 and (o.metadata->>'size')::bigint=v.byte_size and lower(o.metadata->>'mimetype')=v.mime_type) then raise exception 'Uploaded file is missing or metadata differs' using errcode='22023';end if;
 update legal_private.document_versions set state='ready',committed_at=now() where id=v.id returning * into v;
 update legal_private.documents set current_version=v.version_no where id=d.id;
 end if;
 result:=jsonb_build_object('version',to_jsonb(v));
 end if;
 insert into legal_private.events(firm_id,matter_id,actor_id,action,request_id,details) values(p_firm,m.id,actor,'work_'||p_action,p_request,jsonb_build_object('input',p_payload,'before',before,'result',result));
 insert into legal_private.receipts values(p_firm,actor,p_request,'work_'||p_action,p_payload,result);
 return result||jsonb_build_object('deduplicated',false);
end $$;
-- Dynamic authorization for each authenticated file request. No bearer/signed URLs.
create function legal_private.file_access(p_path text,p_write boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from legal_private.document_versions v join legal_private.matters m on m.id=v.matter_id
 where v.path=p_path and legal_private.work_enabled(v.firm_id,'documents') and
 legal_private.matter_access(v.matter_id,case when p_write then 'edit' else 'view' end) and
 case when p_write then v.state='pending' and v.uploaded_by=auth.uid() and m.status not in ('closed','archived')
 else v.state='ready' or(v.state='pending' and v.uploaded_by=auth.uid()) end)
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('arch9-legal-matters','arch9-legal-matters',false,6291456,array['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
create policy arch9_legal_files_read on storage.objects for select to authenticated using(bucket_id='arch9-legal-matters' and legal_private.file_access(name));
create policy arch9_legal_files_insert on storage.objects for insert to authenticated with check(bucket_id='arch9-legal-matters' and legal_private.file_access(name,true));
-- Existing permissive policies cannot accidentally open this private bucket.
create policy arch9_legal_files_read_fence on storage.objects as restrictive for select to public using(bucket_id<>'arch9-legal-matters' or legal_private.file_access(name));
create policy arch9_legal_files_insert_fence on storage.objects as restrictive for insert to public with check(bucket_id<>'arch9-legal-matters' or legal_private.file_access(name,true));
create policy arch9_legal_files_no_update on storage.objects as restrictive for update to public using(bucket_id<>'arch9-legal-matters') with check(bucket_id<>'arch9-legal-matters');
create policy arch9_legal_files_no_delete on storage.objects as restrictive for delete to public using(bucket_id<>'arch9-legal-matters');
-- Fail closed even if a Storage service identity bypasses RLS. Old versions are never replaced/deleted.
create function legal_private.immutable_file() returns trigger language plpgsql set search_path='' as $$
begin
 if old.bucket_id='arch9-legal-matters' or (tg_op='UPDATE' and new.bucket_id='arch9-legal-matters') then raise exception 'Legal file versions are immutable' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger arch9_legal_immutable_file before update or delete on storage.objects for each row execute function legal_private.immutable_file();
revoke all on function legal_private.work_enabled(uuid,text),legal_private.work_read(uuid,uuid),legal_private.work_command(uuid,uuid,text,jsonb),legal_private.file_access(text,boolean),legal_private.immutable_file() from public,anon,authenticated;
grant execute on function legal_private.work_read(uuid,uuid),legal_private.work_command(uuid,uuid,text,jsonb) to authenticated;
grant execute on function legal_private.file_access(text,boolean) to anon,authenticated;
create function public.arch9_legal_work_read(p_firm_id uuid,p_matter_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select legal_private.work_read(p_firm_id,p_matter_id) $$;
create function public.arch9_legal_work_command(p_firm_id uuid,p_request_id uuid,p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select legal_private.work_command(p_firm_id,p_request_id,p_action,p_payload) $$;
revoke all on function public.arch9_legal_work_read(uuid,uuid),public.arch9_legal_work_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.arch9_legal_work_read(uuid,uuid),public.arch9_legal_work_command(uuid,uuid,text,jsonb) to authenticated;
commit;
