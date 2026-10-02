begin;
-- Versioned learning records. Completion is training evidence, not compliance certification.
create table public.branch_fic_training_progress (
  organisation_id uuid not null references public.organisations(id),
  branch_id uuid not null references public.organisation_branches(id),
  user_id uuid not null references auth.users(id),
  course_version text not null check(course_version = '2026.10'),
  completed_lessons integer[] not null default '{}',
  assigned_at timestamptz, assigned_by uuid references auth.users(id), due_on date,
  updated_at timestamptz not null default now(),
  primary key(branch_id,user_id,course_version)
);
create table public.branch_fic_training_attempts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  branch_id uuid not null references public.organisation_branches(id),
  user_id uuid not null references auth.users(id),
  course_version text not null check(course_version = '2026.10'),
  answers integer[] not null, score integer not null, total_questions integer not null default 6,
  passed boolean not null, completed_at timestamptz not null default now()
);
create table public.organisation_fic_policies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  version text not null, title text not null, responsible_person text not null,
  storage_path text not null, published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(), is_current boolean not null default true,
  unique(organisation_id,version)
);
create unique index organisation_fic_policy_current on public.organisation_fic_policies(organisation_id) where is_current;
create table public.branch_fic_policy_acknowledgements (
  policy_id uuid not null references public.organisation_fic_policies(id),
  organisation_id uuid not null references public.organisations(id),
  branch_id uuid not null references public.organisation_branches(id),
  user_id uuid not null references auth.users(id),
  acknowledged_at timestamptz not null default now(),
  primary key(policy_id,branch_id,user_id)
);
create index branch_fic_attempts_scope on public.branch_fic_training_attempts(branch_id,user_id,completed_at desc);
create index branch_fic_progress_scope on public.branch_fic_training_progress(organisation_id,branch_id);
create index branch_fic_ack_scope on public.branch_fic_policy_acknowledgements(branch_id,policy_id);

-- Narrow definer helpers avoid recursive organisation membership RLS. No user-editable JWT claims.
create function public.fic_org_access(p_org uuid, p_manage boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
select auth.uid() is not null and exists(select 1 from public.organisation_users u where u.organisation_id=p_org and u.user_id=auth.uid()
 and lower(trim(coalesce(u.membership_status,u.status,''))) in ('active','accepted')
 and (not p_manage or lower(coalesce(nullif(trim(u.workspace_role),''),nullif(trim(u.organization_role),''),nullif(trim(u.organisation_role),''),trim(u.role),'')) in ('owner','principal','principal / owner')));
$$;
create function public.fic_branch_access(p_org uuid,p_branch uuid,p_manage boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
select auth.uid() is not null and exists(select 1 from public.organisation_branches b where b.id=p_branch and b.organisation_id=p_org)
and exists(select 1 from public.organisation_users u where u.organisation_id=p_org and u.user_id=auth.uid() and lower(trim(coalesce(u.membership_status,u.status,''))) in ('active','accepted')
 and (public.fic_org_access(p_org,true) or (coalesce(u.branch_id,u.primary_branch_id)=p_branch
 and (not p_manage or lower(coalesce(nullif(trim(u.workspace_role),''),nullif(trim(u.organization_role),''),nullif(trim(u.organisation_role),''),trim(u.role),'')) in ('branch_manager','branch_admin','branch manager','compliance')))));
$$;
revoke all on function public.fic_org_access(uuid,boolean), public.fic_branch_access(uuid,uuid,boolean) from public,anon;
grant execute on function public.fic_org_access(uuid,boolean), public.fic_branch_access(uuid,uuid,boolean) to authenticated;

alter table public.branch_fic_training_progress enable row level security;
alter table public.branch_fic_training_attempts enable row level security;
alter table public.organisation_fic_policies enable row level security;
alter table public.branch_fic_policy_acknowledgements enable row level security;
revoke all on public.branch_fic_training_progress,public.branch_fic_training_attempts,public.organisation_fic_policies,public.branch_fic_policy_acknowledgements from public,anon,authenticated;
grant select on public.branch_fic_training_progress,public.branch_fic_training_attempts,public.organisation_fic_policies,public.branch_fic_policy_acknowledgements to authenticated;
create policy fic_progress_read on public.branch_fic_training_progress for select to authenticated using(public.fic_branch_access(organisation_id,branch_id) and (user_id=auth.uid() or public.fic_branch_access(organisation_id,branch_id,true)));
create policy fic_attempts_read on public.branch_fic_training_attempts for select to authenticated using(public.fic_branch_access(organisation_id,branch_id) and (user_id=auth.uid() or public.fic_branch_access(organisation_id,branch_id,true)));
create policy fic_policy_read on public.organisation_fic_policies for select to authenticated using(public.fic_org_access(organisation_id));
create policy fic_ack_read on public.branch_fic_policy_acknowledgements for select to authenticated using(public.fic_branch_access(organisation_id,branch_id) and (user_id=auth.uid() or public.fic_branch_access(organisation_id,branch_id,true)));

create function public.fic_save_lesson(p_org uuid,p_branch uuid,p_lesson integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.fic_branch_access(p_org,p_branch) then raise exception 'Branch training access denied' using errcode='42501'; end if;
 if p_lesson is null or p_lesson<0 or p_lesson>5 then raise exception 'Invalid lesson'; end if;
 insert into public.branch_fic_training_progress(organisation_id,branch_id,user_id,course_version,completed_lessons) values(p_org,p_branch,auth.uid(),'2026.10',array[p_lesson])
 on conflict(branch_id,user_id,course_version) do update set completed_lessons=(select array_agg(distinct x order by x) from unnest(public.branch_fic_training_progress.completed_lessons||array[p_lesson]) x),updated_at=now();
end; $$;
create function public.fic_submit_assessment(p_org uuid,p_branch uuid,p_answers integer[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_score integer:=0; v_key integer[]:=array[1,0,2,1,0,2]; v_count integer; v_id uuid;
begin
 if not public.fic_branch_access(p_org,p_branch) then raise exception 'Branch training access denied' using errcode='42501'; end if;
 if p_answers is null or cardinality(p_answers)<>6 or array_ndims(p_answers)<>1 or array_lower(p_answers,1)<>1 or exists(select 1 from unnest(p_answers) a where a is null or a<0 or a>2) then raise exception 'Answer all six questions'; end if;
 select cardinality(completed_lessons) into v_count from public.branch_fic_training_progress where branch_id=p_branch and user_id=auth.uid() and course_version='2026.10';
 if coalesce(v_count,0)<>6 then raise exception 'Complete all lessons before the assessment'; end if;
 for i in 1..6 loop if p_answers[i]=v_key[i] then v_score:=v_score+1; end if; end loop;
 insert into public.branch_fic_training_attempts(organisation_id,branch_id,user_id,course_version,answers,score,passed) values(p_org,p_branch,auth.uid(),'2026.10',p_answers,v_score,v_score>=5) returning id into v_id;
 return jsonb_build_object('id',v_id,'score',v_score,'total_questions',6,'passed',v_score>=5);
end; $$;
create function public.fic_assign_branch_training(p_org uuid,p_branch uuid,p_due date default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
 if not public.fic_branch_access(p_org,p_branch,true) then raise exception 'Branch training management denied' using errcode='42501'; end if;
 insert into public.branch_fic_training_progress(organisation_id,branch_id,user_id,course_version,assigned_at,assigned_by,due_on)
 select distinct p_org,p_branch,u.user_id,'2026.10',now(),auth.uid(),p_due from public.organisation_users u
 where u.organisation_id=p_org and coalesce(u.branch_id,u.primary_branch_id)=p_branch and lower(trim(coalesce(u.membership_status,u.status,''))) in ('active','accepted') and u.user_id is not null
 on conflict(branch_id,user_id,course_version) do update set assigned_at=coalesce(public.branch_fic_training_progress.assigned_at,excluded.assigned_at),assigned_by=excluded.assigned_by,due_on=excluded.due_on,updated_at=now();
 get diagnostics v_count=row_count; return v_count;
end; $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('fic-compliance','fic-compliance',false,10485760,array['application/pdf']);
create policy fic_document_read on storage.objects for select to authenticated using(bucket_id='fic-compliance' and exists(select 1 from public.organisation_fic_policies p where p.storage_path=name and public.fic_org_access(p.organisation_id)));
create policy fic_document_upload on storage.objects for insert to authenticated with check(bucket_id='fic-compliance' and (storage.foldername(name))[1]='organisations' and exists(select 1 from public.organisations o where o.id::text=(storage.foldername(name))[2] and public.fic_org_access(o.id,true)));
-- Restrictive guards keep older permissive storage policies from widening this bucket.
create policy fic_document_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'fic-compliance' or exists(select 1 from public.organisation_fic_policies p where p.storage_path=name and public.fic_org_access(p.organisation_id)));
create policy fic_document_upload_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'fic-compliance' or ((storage.foldername(name))[1]='organisations' and exists(select 1 from public.organisations o where o.id::text=(storage.foldername(name))[2] and public.fic_org_access(o.id,true))));
create policy fic_document_immutable_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'fic-compliance') with check(bucket_id<>'fic-compliance');
create policy fic_document_immutable_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'fic-compliance');
create policy fic_document_anon_guard on storage.objects as restrictive for all to anon using(bucket_id<>'fic-compliance') with check(bucket_id<>'fic-compliance');
create function public.fic_publish_policy(p_org uuid,p_version text,p_title text,p_owner text,p_path text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if not public.fic_org_access(p_org,true) then raise exception 'Organisation policy management denied' using errcode='42501'; end if;
 if nullif(trim(p_version),'') is null or nullif(trim(p_title),'') is null or nullif(trim(p_owner),'') is null then raise exception 'Version, title and responsible person are required'; end if;
 if p_path is null or p_path not like 'organisations/'||p_org::text||'/%' or not exists(select 1 from storage.objects where bucket_id='fic-compliance' and name=p_path) then raise exception 'Upload the policy PDF first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 update public.organisation_fic_policies set is_current=false where organisation_id=p_org and is_current;
 insert into public.organisation_fic_policies(organisation_id,version,title,responsible_person,storage_path,published_by) values(p_org,trim(p_version),trim(p_title),trim(p_owner),p_path,auth.uid()) returning id into v_id;
 return v_id;
end; $$;
create function public.fic_acknowledge_policy(p_org uuid,p_branch uuid,p_policy uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.fic_branch_access(p_org,p_branch) then raise exception 'Branch training access denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 if not exists(select 1 from public.organisation_fic_policies where id=p_policy and organisation_id=p_org and is_current) then raise exception 'The RMCP version changed. Reload before acknowledging'; end if;
 insert into public.branch_fic_policy_acknowledgements(policy_id,organisation_id,branch_id,user_id) values(p_policy,p_org,p_branch,auth.uid()) on conflict do nothing;
end; $$;
revoke all on function public.fic_save_lesson(uuid,uuid,integer),public.fic_submit_assessment(uuid,uuid,integer[]),public.fic_assign_branch_training(uuid,uuid,date),public.fic_publish_policy(uuid,text,text,text,text),public.fic_acknowledge_policy(uuid,uuid,uuid) from public,anon;
grant execute on function public.fic_save_lesson(uuid,uuid,integer),public.fic_submit_assessment(uuid,uuid,integer[]),public.fic_assign_branch_training(uuid,uuid,date),public.fic_publish_policy(uuid,text,text,text,text),public.fic_acknowledge_policy(uuid,uuid,uuid) to authenticated;
commit;
