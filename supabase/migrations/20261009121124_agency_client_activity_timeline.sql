-- Agency client timeline. Depends on agency_client_identity_and_reviewed_merge.
-- Source records remain authoritative; this journal is append-only for app users.
begin;

create table public.agency_client_activity (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  client_id uuid not null,
  category text not null check (category in ('enquiry','interaction','task','appointment','transaction','document','offer','portal','profile')),
  event_type text not null,
  title text not null check (length(title) between 1 and 250),
  detail text check (length(detail)<=4000),
  actor_id uuid,
  actor_name text,
  actor_kind text not null check (actor_kind in ('staff','client','system','historical')),
  source_kind text,
  source_id uuid,
  origin_table text not null,
  origin_id uuid not null,
  event_key text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  historical boolean not null default false,
  foreign key (organisation_id,client_id) references public.agency_client_profiles(organisation_id,id),
  check ((source_kind is null)=(source_id is null)),
  unique (organisation_id,client_id,event_key)
);
create index agency_client_activity_timeline on public.agency_client_activity(organisation_id,client_id,occurred_at desc,id desc);
create index agency_client_activity_origin on public.agency_client_activity(origin_table,origin_id);
create unique index agency_client_activity_manual_request on public.agency_client_activity(organisation_id,event_key) where origin_table='manual';
alter table public.agency_client_activity enable row level security;
revoke all on public.agency_client_activity from public,anon,authenticated;
grant select on public.agency_client_activity to authenticated;
grant all on public.agency_client_activity to service_role;

-- SECURITY INVOKER deliberately reuses the source table's RLS, including private
-- professional notes/document restrictions. It never bypasses source permissions.
create function arch9_client_private.activity_origin_visible(p_table text,p_id uuid) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare v_key text; v_visible boolean;
begin
  if p_table in ('manual','profile','portal_visit','source_removal') then return true; end if;
  v_key:=case p_table when 'leads' then 'lead_id' when 'contacts' then 'contact_id'
    when 'lead_activities' then 'activity_id' when 'tasks' then 'task_id'
    when 'appointments' then 'appointment_id' when 'appointment_participants' then 'participant_id'
    when 'buyers' then 'id' when 'canvassing_prospects' then 'id'
    when 'transactions' then 'id' when 'transaction_events' then 'id' when 'transaction_comments' then 'id'
    when 'documents' then 'id' when 'offers' then 'id' when 'private_listing_activity' then 'id'
    when 'private_listing_seller_onboarding' then 'id' when 'buyer_viewing_preference_links' then 'id'
    when 'seller_viewing_coordination_links' then 'id' end;
  if p_table in ('client_issues','alteration_requests','service_reviews','transaction_handover','transaction_onboarding','transaction_bond_applications','client_portal_notifications','private_listing_documents') then v_key:='id'; end if;
  if v_key is null then return false; end if;
  execute format('select exists(select 1 from public.%I where %I=$1)',p_table,v_key) into v_visible using p_id;
  return v_visible;
exception when insufficient_privilege then return false;
end;
$$;
revoke all on function arch9_client_private.activity_origin_visible(text,uuid) from public,anon;
grant execute on function arch9_client_private.activity_origin_visible(text,uuid) to authenticated;
create policy agency_client_activity_read on public.agency_client_activity for select to authenticated using (
  arch9_client_private.can_read_client(client_id)
  and (source_kind is null or arch9_client_private.source_visible(organisation_id,source_kind,source_id))
  and arch9_client_private.activity_origin_visible(origin_table,origin_id)
);

-- A source record may describe both parties. Store one event per distinct client,
-- preferring the enquiry/contact anchor when available. Never match by name/phone.
create function arch9_client_private.activity_anchors(p_table text,p_row jsonb)
returns table(organisation_id uuid,source_kind text,source_id uuid)
language plpgsql stable security definer set search_path='' as $$
declare v_org uuid:=nullif(p_row->>'organisation_id','')::uuid; v_transaction uuid; v_listing uuid; v_appointment jsonb;
begin
  if p_table='leads' then return query select v_org,'lead'::text,(p_row->>'lead_id')::uuid; return; end if;
  if p_table='contacts' then return query select v_org,'contact'::text,(p_row->>'contact_id')::uuid; return; end if;
  if p_table='buyers' then
    return query select v_org,'buyer'::text,(p_row->>'id')::uuid where v_org is not null
      union all select t.organisation_id,'transaction_buyer'::text,t.id from public.transactions t where t.buyer_id=(p_row->>'id')::uuid;
    return;
  end if;
  if p_table='canvassing_prospects' then return query select v_org,'prospect'::text,(p_row->>'id')::uuid; return; end if;
  if p_table='appointment_participants' then
    select to_jsonb(a) into v_appointment from public.appointments a where a.appointment_id=(p_row->>'appointment_id')::uuid;
    -- RSVP belongs to the invited client, not every party to the transaction.
    return query select distinct l.organisation_id,l.source_kind,l.source_id
      from arch9_client_private.activity_anchors('appointments',v_appointment) a
      join public.agency_client_links l on l.organisation_id=a.organisation_id and l.source_kind=a.source_kind and l.source_id=a.source_id
      join public.agency_client_identifiers i on i.client_id=l.client_id and i.organisation_id=l.organisation_id and i.kind='email'
      where i.value=lower(trim(p_row->>'email')) and lower(p_row->>'participant_role') in ('buyer','seller','client');
    return;
  end if;
  if p_table in ('lead_activities','tasks','appointments','buyer_viewing_preference_links','seller_viewing_coordination_links') and nullif(p_row->>'lead_id','') is not null then
    return query select v_org,'lead'::text,(p_row->>'lead_id')::uuid; return;
  end if;
  if p_table='appointments' and nullif(p_row->>'contact_id','') is not null then
    return query select v_org,'contact'::text,(p_row->>'contact_id')::uuid; return;
  end if;
  if p_table='offers' then
    return query select v_org,'lead'::text,(p_row->>'buyer_lead_id')::uuid where nullif(p_row->>'buyer_lead_id','') is not null
      union all select v_org,'lead'::text,(p_row->>'seller_lead_id')::uuid where nullif(p_row->>'seller_lead_id','') is not null;
    if nullif(p_row->>'buyer_lead_id','') is null then return query select v_org,'contact'::text,(p_row->>'buyer_contact_id')::uuid where nullif(p_row->>'buyer_contact_id','') is not null; end if;
    if nullif(p_row->>'seller_lead_id','') is null then return query select v_org,'contact'::text,(p_row->>'seller_contact_id')::uuid where nullif(p_row->>'seller_contact_id','') is not null; end if;
    return;
  end if;
  v_transaction:=case when p_table='transactions' then (p_row->>'id')::uuid else nullif(p_row->>'transaction_id','')::uuid end;
  if v_transaction is not null then
    return query select t.organisation_id,l.source_kind,t.id from public.transactions t join public.agency_client_links l
      on l.organisation_id=t.organisation_id and l.source_id=t.id and l.source_kind in ('transaction_buyer','transaction_seller')
      where t.id=v_transaction and (v_org is null or v_org=t.organisation_id)
      and (p_table not in ('client_issues','alteration_requests','service_reviews','transaction_handover','transaction_onboarding') or l.source_kind='transaction_buyer')
      and (p_table<>'client_portal_notifications' or l.source_kind=case p_row->>'client_role' when 'buyer' then 'transaction_buyer' when 'seller' then 'transaction_seller' end); return;
  end if;
  v_listing:=coalesce(nullif(p_row->>'private_listing_id',''),case when p_table='appointments' and p_row->>'listing_id' ~* '^[0-9a-f-]{36}$' then p_row->>'listing_id' end)::uuid;
  if v_listing is not null then return query select l.organisation_id,'listing_seller'::text,l.id from public.private_listings l where l.id=v_listing and (v_org is null or v_org=l.organisation_id); end if;
end;
$$;

create function arch9_client_private.activity_actor_name(p_id uuid) returns text
language sql stable security definer set search_path='' as $$
  select left(coalesce(nullif(trim(concat_ws(' ',to_jsonb(p)->>'first_name',to_jsonb(p)->>'last_name')),''),nullif(to_jsonb(p)->>'full_name',''),nullif(to_jsonb(p)->>'display_name','')),200) from public.profiles p where p.id=p_id;
$$;
revoke all on function arch9_client_private.activity_actor_name(uuid) from public,anon,authenticated;

create function arch9_client_private.emit_activity(p_table text,p_row jsonb,p_origin_id uuid,p_category text,p_type text,p_title text,p_detail text,p_at timestamptz,p_key text,p_historical boolean default false,p_client_action boolean default false,p_origin_override text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.agency_client_activity(organisation_id,client_id,category,event_type,title,detail,actor_id,actor_name,actor_kind,source_kind,source_id,origin_table,origin_id,event_key,occurred_at,historical)
  select distinct on (l.client_id) l.organisation_id,l.client_id,p_category,p_type,left(p_title,250),nullif(left(p_detail,4000),''),
    case when p_historical then null else auth.uid() end,
    case when p_historical then null else arch9_client_private.activity_actor_name(auth.uid()) end,
    case when p_historical then 'historical' when p_client_action and not arch9_client_private.is_member(l.organisation_id) then 'client' when auth.uid() is not null then 'staff' else 'system' end,
    l.source_kind,l.source_id,coalesce(p_origin_override,p_table),p_origin_id,p_key,coalesce(p_at,now()),p_historical
  from arch9_client_private.activity_anchors(p_table,p_row) a join public.agency_client_links l
    on l.organisation_id=a.organisation_id and l.source_kind=a.source_kind and l.source_id=a.source_id
  order by l.client_id,l.source_kind,l.source_id
  on conflict (organisation_id,client_id,event_key) do nothing;
end;
$$;

create function arch9_client_private.capture_activity(p_table text,p_row jsonb,p_before jsonb,p_op text) returns void
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=case p_table when 'leads' then (p_row->>'lead_id')::uuid when 'contacts' then (p_row->>'contact_id')::uuid
  when 'lead_activities' then (p_row->>'activity_id')::uuid when 'tasks' then (p_row->>'task_id')::uuid
  when 'appointments' then (p_row->>'appointment_id')::uuid when 'appointment_participants' then (p_row->>'participant_id')::uuid else (p_row->>'id')::uuid end;
  v_category text; v_title text; v_detail text; v_type text; v_fields text[]; v_changes text[]; v_field text;
  v_history boolean:=p_op='BACKFILL'; v_at timestamptz; v_key text; v_party jsonb;
begin
  if coalesce(p_row->>'is_demo_data',p_row->>'isDemoData','false')='true'
    or p_row->'demo_metadata' @> '{"seedData":true}' or p_row->'demo_metadata' @> '{"isDemoData":true}'
    or p_row->'demo_metadata' @> '{"is_demo_data":true}' or p_row->'demo_metadata' @> '{"seed_data":true}'
    or p_row->'demo_metadata' @> '{"migratedFromLocalStorage":true}' then return; end if;
  v_at:=case when v_history or p_op='INSERT' then coalesce(nullif(p_row->>'activity_date','')::timestamptz,nullif(p_row->>'created_at','')::timestamptz,now()) else clock_timestamp() end;
  case p_table
    when 'leads' then v_category:='enquiry'; v_title:='Enquiry recorded'; v_detail:=concat_ws(' · ',nullif(p_row->>'lead_source',''),nullif(p_row->>'enquired_property_title','')); v_fields:=array['stage','current_stage','status','assigned_user_id','assigned_agent_id','contact_id','converted_transaction_id'];
    when 'contacts','buyers','canvassing_prospects' then v_category:='profile'; v_title:='Contact recorded'; v_fields:=array['first_name','last_name','name','email','phone'];
    when 'lead_activities' then v_category:='interaction'; v_title:=coalesce(nullif(p_row->>'activity_type',''),'Note')||' logged'; v_detail:=concat_ws(' · ',nullif(p_row->>'activity_note',''),nullif(p_row->>'outcome','')); v_fields:=array['activity_type','activity_note','outcome','activity_date'];
    when 'tasks' then v_category:='task'; v_title:='Task created'; v_detail:=p_row->>'title'; v_fields:=array['title','description','status','due_date','assigned_agent_id'];
    when 'appointments' then v_category:='appointment'; v_title:='Appointment scheduled'; v_detail:=p_row->>'title'; v_fields:=array['status','date_time','appointment_date','start_time','end_time','outcome_summary','client_feedback','completed_at','cancelled_at'];
    when 'appointment_participants' then
      v_category:='appointment'; v_title:='Appointment response received'; v_detail:=p_row->>'rsvp_status'; v_fields:=array['rsvp_status','proposed_new_time','responded_at'];
      if nullif(p_row->>'responded_at','') is null then return; end if;
      v_at:=case when v_history then (p_row->>'responded_at')::timestamptz else v_at end;
    when 'transactions' then v_category:='transaction'; v_title:='Transaction linked'; v_fields:=array['status','stage','current_stage'];
    when 'transaction_events' then v_category:='transaction'; v_title:='Transaction activity recorded'; v_detail:=replace(p_row->>'event_type','_',' '); v_fields:=array['event_type'];
    when 'transaction_comments' then v_category:='interaction'; v_title:='Message recorded'; v_detail:=p_row->>'comment_text'; v_fields:=array['comment_text'];
    when 'documents' then v_category:='document'; v_title:='Document uploaded'; v_detail:=coalesce(p_row->>'document_name',p_row->>'name',p_row->>'document_type'); v_fields:=array['status','review_status','version_number','file_path'];
    when 'private_listing_documents' then v_category:='document'; v_title:='Listing document uploaded'; v_detail:=coalesce(p_row->>'document_name',p_row->>'document_type'); v_fields:=array['status','reviewed_at','storage_path'];
    when 'client_issues' then v_category:='portal'; v_title:='Snag reported'; v_fields:=array['status','client_confirmed_at','client_rejected_at','signed_off_at','completed_at'];
    when 'alteration_requests' then v_category:='portal'; v_title:='Alteration requested'; v_fields:=array['status','title','proof_of_payment_path'];
    when 'service_reviews' then v_category:='portal'; v_title:='Service review submitted'; v_detail:='Rating: '||(p_row->>'rating'); v_fields:=array['rating','review_text','allow_marketing_use'];
    when 'transaction_handover' then v_category:='portal'; v_title:='Handover recorded'; v_fields:=array['status','handover_date','inspection_completed','signature_signed_at','attendance_confirmed_at'];
    when 'transaction_bond_applications' then v_category:='transaction'; v_title:='Finance application recorded'; v_fields:=array['status','submitted_at','feedback_received_at'];
    when 'transaction_onboarding' then
      if nullif(p_row->>'submitted_at','') is not null and (v_history or p_row->>'submitted_at' is distinct from p_before->>'submitted_at') then
        perform arch9_client_private.emit_activity(p_table,p_row,v_id,'portal','onboarding.submitted','Buyer onboarding submitted',null,(p_row->>'submitted_at')::timestamptz,p_table||':'||v_id||':submitted:'||(p_row->>'submitted_at'),v_history,true);
      end if;
      return;
    when 'client_portal_notifications' then
      foreach v_field in array array['read_at','dismissed_at'] loop
        if nullif(p_row->>v_field,'') is not null and (v_history or p_row->>v_field is distinct from p_before->>v_field) then
          perform arch9_client_private.emit_activity(p_table,p_row,v_id,'portal','notification.'||v_field,case v_field when 'read_at' then 'Notification read' else 'Notification dismissed' end,null,(p_row->>v_field)::timestamptz,p_table||':'||v_id||':'||v_field||':'||(p_row->>v_field),v_history,true);
        end if;
      end loop;
      return;
    when 'offers' then v_category:='offer'; v_title:='Offer recorded'; v_detail:=p_row->>'status'; v_fields:=array['status','offer_amount','submitted_at','accepted_at','rejected_at','countered_at','withdrawn_at'];
    when 'private_listing_activity' then v_category:='interaction'; v_title:=coalesce(nullif(p_row->>'activity_title',''),'Listing activity'); v_detail:=p_row->>'activity_description'; v_fields:=array['activity_title','activity_description','activity_type'];
    when 'private_listing_seller_onboarding' then
      -- Never copy form data, passwords, access tokens, or bank account details.
      if nullif(p_row->>'submitted_at','') is not null and (v_history or p_row->>'submitted_at' is distinct from p_before->>'submitted_at') then
        perform arch9_client_private.emit_activity(p_table,p_row,v_id,'portal','onboarding.submitted','Seller onboarding submitted',null,(p_row->>'submitted_at')::timestamptz,p_table||':'||v_id||':submitted:'||(p_row->>'submitted_at'),v_history,true);
      end if;
      if not v_history and nullif(p_row->>'seller_portal_last_login_at','') is not null and p_row->>'seller_portal_last_login_at' is distinct from p_before->>'seller_portal_last_login_at' then
        perform arch9_client_private.emit_activity(p_table,p_row,v_id,'portal','portal.login','Seller signed into the portal',null,(p_row->>'seller_portal_last_login_at')::timestamptz,p_table||':'||v_id||':login:'||(p_row->>'seller_portal_last_login_at'),false,true);
      end if;
      return;
    when 'buyer_viewing_preference_links','seller_viewing_coordination_links' then
      if nullif(p_row->>'submitted_at','') is null or (not v_history and p_row->>'submitted_at' is not distinct from p_before->>'submitted_at') then return; end if;
      perform arch9_client_private.emit_activity(p_table,p_row,v_id,'appointment','viewing.response','Viewing preferences submitted',null,(p_row->>'submitted_at')::timestamptz,p_table||':'||v_id||':response:'||(p_row->>'submitted_at'),v_history,true); return;
    else return;
  end case;
  if p_table='offers' then
    foreach v_field in array array['buyer_viewed_at','buyer_submitted_at','seller_viewed_at'] loop
      if nullif(p_row->>v_field,'') is not null and (v_history or p_row->>v_field is distinct from p_before->>v_field) then
        v_party:=p_row;
        if v_field like 'buyer_%' then v_party:=v_party-'seller_lead_id'-'seller_contact_id'; else v_party:=v_party-'buyer_lead_id'-'buyer_contact_id'; end if;
        perform arch9_client_private.emit_activity(p_table,v_party,v_id,'offer','offer.'||v_field,replace(v_field,'_',' '),null,(p_row->>v_field)::timestamptz,p_table||':'||v_id||':'||v_field||':'||(p_row->>v_field),v_history,true);
      end if;
    end loop;
  end if;
  if p_op='UPDATE' then
    select array_agg(f order by f) into v_changes from unnest(v_fields) f where p_row->f is distinct from p_before->f;
    if v_changes is null then return; end if;
    v_title:=case p_table when 'leads' then 'Enquiry updated' when 'lead_activities' then 'Interaction updated' when 'tasks' then 'Task updated' when 'appointments' then 'Appointment updated' when 'appointment_participants' then 'Appointment response received' when 'offers' then 'Offer updated' when 'documents' then 'Document updated' else 'Record updated' end;
    -- Only safe status values and changed field names enter the journal.
    if p_table not in ('lead_activities','transaction_comments','private_listing_activity') then
      v_detail:=concat_ws(' · ',nullif(p_row->>'status',''),nullif(p_row->>'rsvp_status',''),'Changed: '||array_to_string(v_changes,', '));
    end if;
  elsif p_op='DELETE' then v_title:='Record removed'; v_detail:=null;
  end if;
  v_type:=p_table||'.'||lower(case when v_history then 'recorded' else p_op end);
  -- Created/backfilled events share a stable key; updates/deletions have a fresh
  -- occurrence ID. Unchanged saves produce no event, and transport retries dedupe.
  v_key:=p_table||':'||v_id||case when p_op in ('INSERT','BACKFILL') then ':created' else ':'||gen_random_uuid()::text end;
  perform arch9_client_private.emit_activity(p_table,p_row,v_id,v_category,v_type,v_title,v_detail,v_at,v_key,v_history,
    p_table in ('appointment_participants','client_issues','alteration_requests','service_reviews','transaction_handover')
    or (p_table='documents' and lower(p_row->>'uploaded_by_role') in ('buyer','seller','client'))
    or (p_table='transaction_comments' and lower(p_row->>'author_role') in ('buyer','seller','client')),
    case when p_op='DELETE' and p_table in ('lead_activities','tasks') then 'source_removal' end);
end;
$$;

create function arch9_client_private.activity_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then perform arch9_client_private.capture_activity(tg_table_name,to_jsonb(old),null,tg_op); return old; end if;
  perform arch9_client_private.capture_activity(tg_table_name,to_jsonb(new),case when tg_op='UPDATE' then to_jsonb(old) end,tg_op); return new;
end;
$$;

-- New aliases/late identity creation can reveal older related records. Replay only
-- those associations with stable keys, retaining their original occurrence date.
create function arch9_client_private.activity_link_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare v_table text; v_row jsonb; v_column text;
begin
  if new.source_kind='lead' then
    foreach v_table in array array['lead_activities','tasks','appointments','buyer_viewing_preference_links','seller_viewing_coordination_links'] loop
      for v_row in execute format('select to_jsonb(r) from public.%I r where lead_id=$1 and organisation_id=$2',v_table) using new.source_id,new.organisation_id loop
        if nullif(v_row->>'created_at','')::timestamptz<transaction_timestamp() then perform arch9_client_private.capture_activity(v_table,v_row,null,'BACKFILL'); end if;
      end loop;
    end loop;
  elsif new.source_kind in ('transaction_buyer','transaction_seller') then
    foreach v_table in array array['transaction_events','transaction_comments','documents','tasks','appointments','client_issues','alteration_requests','service_reviews','transaction_handover','transaction_onboarding','transaction_bond_applications','client_portal_notifications'] loop
      for v_row in execute format('select to_jsonb(r) from public.%I r where transaction_id=$1',v_table) using new.source_id loop
        if nullif(v_row->>'created_at','')::timestamptz<transaction_timestamp() then perform arch9_client_private.capture_activity(v_table,v_row,null,'BACKFILL'); end if;
      end loop;
    end loop;
  elsif new.source_kind='listing_seller' then
    foreach v_table in array array['private_listing_activity','private_listing_seller_onboarding','private_listing_documents'] loop
      for v_row in execute format('select to_jsonb(r) from public.%I r where private_listing_id=$1',v_table) using new.source_id loop
        if coalesce(nullif(v_row->>'submitted_at','')::timestamptz,nullif(v_row->>'created_at','')::timestamptz)<transaction_timestamp() then perform arch9_client_private.capture_activity(v_table,v_row,null,'BACKFILL'); end if;
      end loop;
    end loop;
  end if;
  return new;
end;
$$;

create function arch9_client_private.activity_profile_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare v_client uuid; v_org uuid; v_title text; v_key uuid:=gen_random_uuid();
begin
  if tg_table_name='agency_client_merge_audit' then v_client:=new.primary_id; v_org:=new.organisation_id; v_title:='Client profiles merged'; v_key:=new.id;
  elsif new.name is distinct from old.name or new.primary_email is distinct from old.primary_email or new.primary_phone is distinct from old.primary_phone then
    v_client:=new.id; v_org:=new.organisation_id; v_title:='Client contact details updated';
  else return new; end if;
  insert into public.agency_client_activity(organisation_id,client_id,category,event_type,title,actor_id,actor_name,actor_kind,origin_table,origin_id,event_key,occurred_at)
    values(v_org,v_client,'profile',case when tg_table_name='agency_client_merge_audit' then 'profile.merged' else 'profile.updated' end,v_title,auth.uid(),arch9_client_private.activity_actor_name(auth.uid()),case when auth.uid() is null then 'system' else 'staff' end,'profile',v_client,'profile:'||v_key,clock_timestamp());
  return new;
end;
$$;

-- The manual API derives agency/actor from the accessible profile. The request ID
-- makes an uncertain save safe to retry; it cannot change a previous entry.
create function arch9_client_private.log_client_interaction(p_client_id uuid,p_request_id uuid,p_type text,p_detail text,p_occurred_at timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.agency_client_profiles; v_id uuid; v_existing public.agency_client_activity;
begin
  select * into c from public.agency_client_profiles where id=p_client_id;
  if c.merged_into is not null then select * into c from public.agency_client_profiles where id=c.merged_into; end if;
  if c.id is null or auth.uid() is null or not arch9_client_private.can_read_client(c.id) then raise exception 'Client access required.' using errcode='42501'; end if;
  if p_request_id is null or p_type is null or p_type not in ('call','note','email','message','meeting')
    or length(trim(coalesce(p_detail,''))) not between 1 and 4000 or p_occurred_at is null or p_occurred_at>now()+interval '5 minutes' then
    raise exception 'Choose an interaction type, details and a valid occurrence time.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(c.organisation_id::text,0));
  -- A merge may finish while this request waits for the agency lock. Resolve
  -- and authorize again before saving against the current profile.
  select * into c from public.agency_client_profiles where id=p_client_id;
  if c.merged_into is not null then select * into c from public.agency_client_profiles where id=c.merged_into; end if;
  if c.id is null or not arch9_client_private.can_read_client(c.id) then raise exception 'Client access required.' using errcode='42501'; end if;
  select * into v_existing from public.agency_client_activity where organisation_id=c.organisation_id and origin_table='manual' and event_key='manual:'||p_request_id;
  if v_existing.id is not null then
    if not exists(select 1 from public.agency_client_profiles p where p.id=v_existing.client_id and coalesce(p.merged_into,p.id)=c.id)
      or v_existing.actor_id is distinct from auth.uid() or v_existing.event_type is distinct from 'interaction.'||p_type
      or v_existing.detail is distinct from trim(p_detail) or v_existing.occurred_at is distinct from p_occurred_at then
      raise exception 'This request ID already records another interaction.' using errcode='22023'; end if;
    return v_existing.id;
  end if;
  insert into public.agency_client_activity(organisation_id,client_id,category,event_type,title,detail,actor_id,actor_name,actor_kind,origin_table,origin_id,event_key,occurred_at)
    values(c.organisation_id,c.id,'interaction','interaction.'||p_type,initcap(p_type)||' logged',trim(p_detail),auth.uid(),arch9_client_private.activity_actor_name(auth.uid()),'staff','manual',p_request_id,'manual:'||p_request_id,p_occurred_at)
    on conflict do nothing returning id into v_id;
  if v_id is null then
    select * into v_existing from public.agency_client_activity where organisation_id=c.organisation_id and client_id=c.id and event_key='manual:'||p_request_id;
    if v_existing.actor_id is distinct from auth.uid() or v_existing.event_type is distinct from 'interaction.'||p_type or v_existing.detail is distinct from trim(p_detail) or v_existing.occurred_at is distinct from p_occurred_at then
      raise exception 'This request ID already records another interaction.' using errcode='22023'; end if;
    v_id:=v_existing.id;
  end if;
  return v_id;
end;
$$;
create function public.agency_client_log_interaction(p_client_id uuid,p_request_id uuid,p_type text,p_detail text,p_occurred_at timestamptz)
returns uuid language sql security invoker set search_path='' as $$ select arch9_client_private.log_client_interaction(p_client_id,p_request_id,p_type,p_detail,p_occurred_at); $$;

-- A portal credential resolves its own party and agency; callers cannot nominate
-- a client. Existing buyer/seller session guards check expiration and revocation.
create function arch9_client_private.record_portal_visit(p_token text,p_seller_access_token text,p_section text,p_request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_context record; v_link public.client_portal_links; v_row jsonb; v_source_id uuid; v_kind text; l public.agency_client_links;
begin
  if p_section is null or p_section not in ('overview','progress','documents','offers','appointments','details','account','bond_application','handover','snags','settings','team','alterations','review','listing_marketing','document_access_requested') or p_request_id is null then raise exception 'Invalid portal activity.' using errcode='22023'; end if;
  if lower(trim(p_token)) like 'seller-%' then
    select * into v_context from journey_private.resolve_seller_portal_context(p_token,p_seller_access_token);
    v_source_id:=v_context.listing_id; v_kind:='listing_seller';
  else
    select * into v_link from public.client_portal_links where token=p_token and is_active is true;
    if v_link.id is null or public.bridge_client_portal_request_token() is distinct from p_token
      or not coalesce(public.bridge_has_client_portal_token_transaction_access(v_link.transaction_id),false)
      or nullif(to_jsonb(v_link)->>'expires_at','')::timestamptz<=now() then raise exception 'Portal access required.' using errcode='42501'; end if;
    v_source_id:=v_link.transaction_id; v_kind:='transaction_buyer';
  end if;
  select * into l from public.agency_client_links where source_kind=v_kind and source_id=v_source_id;
  if l.id is null then return; end if; -- A portal belonging to another product has no agency identity.
  -- Same section in one minute is one visit, even on reload/repeated requests.
  insert into public.agency_client_activity(organisation_id,client_id,category,event_type,title,actor_kind,source_kind,source_id,origin_table,origin_id,event_key,occurred_at)
    values(l.organisation_id,l.client_id,'portal',case when p_section='document_access_requested' then 'portal.document_access_requested' else 'portal.section_viewed' end,
      case when p_section='document_access_requested' then 'Requested document access in the portal' else 'Viewed '||replace(p_section,'_',' ')||' in the portal' end,
      'client',v_kind,v_source_id,'portal_visit',v_source_id,'portal:'||v_source_id||':'||p_section||':'||date_trunc('minute',now())::text,now())
    on conflict (organisation_id,client_id,event_key) do nothing;
end;
$$;
create function public.agency_client_record_portal_visit(p_token text,p_seller_access_token text,p_section text,p_request_id uuid)
returns void language sql security invoker set search_path='' as $$ select arch9_client_private.record_portal_visit(p_token,p_seller_access_token,p_section,p_request_id); $$;

create function public.agency_client_activity_latest(p_organisation_id uuid)
returns table(client_id uuid,last_activity_at timestamptz) language sql stable security invoker set search_path='' as $$
  select coalesce(p.merged_into,p.id),max(a.occurred_at) from public.agency_client_activity a
    join public.agency_client_profiles p on p.id=a.client_id and p.organisation_id=a.organisation_id
    where a.organisation_id=p_organisation_id group by coalesce(p.merged_into,p.id);
$$;

create function public.agency_client_activity_page(p_client_id uuid,p_before_at timestamptz default null,p_before_id uuid default null,p_category text default null,p_limit integer default 51)
returns setof public.agency_client_activity language sql stable security invoker set search_path='' as $$
  select a.* from public.agency_client_profiles requested
    join public.agency_client_profiles p on coalesce(p.merged_into,p.id)=coalesce(requested.merged_into,requested.id) and p.organisation_id=requested.organisation_id
    join public.agency_client_activity a on a.client_id=p.id and a.organisation_id=p.organisation_id
    where requested.id=p_client_id and (p_category is null or a.category=p_category)
      and ((p_before_at is null and p_before_id is null) or (a.occurred_at,a.id)<(p_before_at,p_before_id))
    order by a.occurred_at desc,a.id desc limit greatest(1,least(coalesce(p_limit,51),101));
$$;

revoke all on function arch9_client_private.activity_anchors(text,jsonb),arch9_client_private.emit_activity(text,jsonb,uuid,text,text,text,text,timestamptz,text,boolean,boolean,text),arch9_client_private.capture_activity(text,jsonb,jsonb,text),arch9_client_private.activity_trigger(),arch9_client_private.activity_link_trigger(),arch9_client_private.activity_profile_trigger() from public,anon,authenticated;
revoke all on function arch9_client_private.log_client_interaction(uuid,uuid,text,text,timestamptz),public.agency_client_log_interaction(uuid,uuid,text,text,timestamptz),public.agency_client_activity_latest(uuid) from public,anon;
grant execute on function arch9_client_private.log_client_interaction(uuid,uuid,text,text,timestamptz),public.agency_client_log_interaction(uuid,uuid,text,text,timestamptz),public.agency_client_activity_latest(uuid) to authenticated;
revoke all on function public.agency_client_activity_page(uuid,timestamptz,uuid,text,integer) from public,anon;
grant execute on function public.agency_client_activity_page(uuid,timestamptz,uuid,text,integer) to authenticated;
revoke all on function arch9_client_private.record_portal_visit(text,text,text,uuid),public.agency_client_record_portal_visit(text,text,text,uuid) from public;
grant usage on schema arch9_client_private to anon;
grant execute on function arch9_client_private.record_portal_visit(text,text,text,uuid),public.agency_client_record_portal_visit(text,text,text,uuid) to anon,authenticated;

do $$ declare v_table text; v_row jsonb; begin
  foreach v_table in array array['contacts','buyers','canvassing_prospects','leads','transactions','lead_activities','tasks','appointments','appointment_participants','transaction_events','transaction_comments','documents','offers','private_listing_activity','private_listing_seller_onboarding','buyer_viewing_preference_links','seller_viewing_coordination_links','client_issues','alteration_requests','service_reviews','transaction_handover','transaction_onboarding','transaction_bond_applications','client_portal_notifications','private_listing_documents'] loop
    execute format('create trigger zz_agency_client_activity after insert or update or delete on public.%I for each row execute function arch9_client_private.activity_trigger()',v_table);
    for v_row in execute format('select to_jsonb(r) from public.%I r',v_table) loop perform arch9_client_private.capture_activity(v_table,v_row,null,'BACKFILL'); end loop;
  end loop;
end $$;
create trigger agency_client_activity_link after insert on public.agency_client_links for each row execute function arch9_client_private.activity_link_trigger();
create trigger agency_client_activity_profile after update on public.agency_client_profiles for each row execute function arch9_client_private.activity_profile_trigger();
create trigger agency_client_activity_merge after insert on public.agency_client_merge_audit for each row execute function arch9_client_private.activity_profile_trigger();
commit;
