begin;
-- Current seller contacts share the listing capture authority. Existing document
-- versions and pending collaboration proposals remain separate evidence.
alter table public.transaction_participants
  add column seller_source_onboarding_id uuid references public.private_listing_seller_onboarding(id),
  add column seller_source_contact_key text;
create index transaction_seller_source_idx on public.transaction_participants(seller_source_onboarding_id,seller_source_contact_key)
  where seller_source_onboarding_id is not null;

create schema if not exists seller_save_private;
revoke all on schema seller_save_private from public,anon;
grant usage on schema seller_save_private to authenticated;
create table seller_save_private.transaction_receipts (
  mutation_id uuid primary key, actor_id uuid not null, transaction_id uuid not null references public.transactions(id) on delete cascade,
  request jsonb not null, receipt jsonb not null, created_at timestamptz not null default now()
);
create table seller_save_private.authorised_commands (
  database_transaction xid8 not null, transaction_id uuid not null,
  primary key(database_transaction,transaction_id)
);
alter table seller_save_private.transaction_receipts enable row level security;
alter table seller_save_private.authorised_commands enable row level security;
revoke all on seller_save_private.transaction_receipts,seller_save_private.authorised_commands from public,anon,authenticated;

create function seller_save_private.can_edit(p_tx uuid,p_listing uuid,p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.bridge_can_access_transaction_spine(p_tx)
    and case when p_listing is not null then public.bridge_can_access_private_listing(p_listing)
      and public.bridge_listing_seller_actor_permission(p_org,'review_change','legal_identity')
    else public.bridge_has_transaction_permission(p_tx,'edit_core_transaction') end;
$$;

-- Locks use the same listing -> capture order as seller/agent save RPCs,
-- followed by transaction -> transaction form -> the exact participant.
create function seller_save_private.edit_context(p_tx uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 t public.transactions%rowtype; o public.private_listing_seller_onboarding%rowtype;
 f public.onboarding_form_data%rowtype; p public.transaction_participants%rowtype;
 listing_id uuid; listing_org uuid; capture_count int; primary_person jsonb; primary_count int;
 participants int; contact_key text; reason text; details jsonb; owner_type text;
begin
 select tr.listing_id into listing_id from public.transactions tr where tr.id=p_tx;
 if listing_id is not null then select organisation_id into listing_org from public.private_listings where id=listing_id; end if;
 select * into t from public.transactions where id=p_tx;
 if t.id is null or not seller_save_private.can_edit(p_tx,listing_id,coalesce(listing_org,t.organisation_id)) then
   raise exception using errcode='42501',message='You do not have permission to edit these seller details.';
 end if;
 if listing_id is not null then
   if t.organisation_id is distinct from listing_org then raise exception using errcode='42501',message='The seller listing agency link needs review.'; end if;
   perform 1 from public.private_listings where id=listing_id for update;
   select count(*) into capture_count from public.private_listing_seller_onboarding where private_listing_id=listing_id;
   if capture_count=1 then select * into o from public.private_listing_seller_onboarding where private_listing_id=listing_id for update;
   else reason:='The listing seller profile link needs review. Open the listing seller profile before editing these contacts.'; end if;
 end if;
 select * into t from public.transactions where id=p_tx for update;
 if t.listing_id is distinct from listing_id then raise exception using errcode='PT409',message='The seller listing link changed. Reload seller details.'; end if;
 select * into f from public.onboarding_form_data where transaction_id=p_tx for update;
 select count(*),jsonb_agg(person)->0 into primary_count,primary_person
   from jsonb_array_elements(coalesce(f.form_data#>'{__bridge_transaction_parties,seller,people}','[]')) person
   where person->>'primaryContact'='true';
 if primary_count=1 then
   select * into p from public.transaction_participants where transaction_id=p_tx
     and role_type='seller' and removed_at is null and id::text=primary_person->>'id' for update;
 end if;
 if p.id is null and primary_count=0 then
   select count(*) into participants from public.transaction_participants where transaction_id=p_tx and role_type='seller' and removed_at is null;
   if participants=1 then select * into p from public.transaction_participants where transaction_id=p_tx and role_type='seller' and removed_at is null for update; end if;
 end if;
 if p.id is null then reason:=coalesce(reason,'The primary seller person link needs review. No owner will be selected from a shared name or email.'); end if;
 owner_type:=coalesce(o.canonical_facts_json#>>'{seller,owner_structure_type}',o.ownership_structure,o.seller_type,t.seller_type,'unknown');
 if o.id is not null and p.id is not null then
   if p.seller_source_onboarding_id=o.id and nullif(p.seller_source_contact_key,'') is not null then contact_key:=p.seller_source_contact_key;
   elsif p.seller_source_onboarding_id is null and p.seller_source_contact_key is null
     and owner_type in ('individual','foreign_individual','married_cop','married_anc')
     and not exists(select 1 from jsonb_array_elements(coalesce(o.form_data->'multipleOwners',o.form_data->'owners','[]')) person)
     and not exists(select 1 from public.transaction_participants where transaction_id=p_tx and role_type='seller' and removed_at is null and id<>p.id)
     then contact_key:='primary_contact';
   else reason:=coalesce(reason,'The seller contact source needs review. Open the listing seller profile to confirm the correct person.'); end if;
 end if;
 details:=jsonb_build_object('name',coalesce(t.seller_name,''),'email',coalesce(t.seller_email,''),'phone',coalesce(t.seller_phone,''));
 if o.id is not null then
   details:=jsonb_build_object('name',coalesce(o.canonical_facts_json#>>'{seller,name}',o.form_data->>'sellerName',t.seller_name,''),
     'email',case when o.form_data ? 'email' then coalesce(o.form_data->>'email','') else coalesce(o.form_data->>'sellerEmail',o.canonical_facts_json#>>'{seller,contact,email}','') end,
     'phone',case when o.form_data ? 'phone' then coalesce(o.form_data->>'phone','') else coalesce(o.form_data->>'sellerPhone',o.form_data->>'mobile',o.canonical_facts_json#>>'{seller,contact,phone}','') end);
 end if;
 return jsonb_build_object('details',details,'blockedReason',reason,'nameEditable',listing_id is null and owner_type in ('individual','foreign_individual','married_cop','married_anc'),
   'revision',jsonb_build_object('transactionId',t.id,'transactionUpdatedAt',t.updated_at,'listingId',t.listing_id,
     'onboardingId',o.id,'onboardingUpdatedAt',o.updated_at,'formId',f.id,'formUpdatedAt',f.updated_at,
     'participantId',p.id,'participantUpdatedAt',p.updated_at,'sourceContactKey',contact_key));
end $$;

create function seller_save_private.authorise(p_tx uuid) returns void
language sql volatile security definer set search_path='' as $$
 insert into seller_save_private.authorised_commands values(pg_current_xact_id(),p_tx) on conflict do nothing;
$$;
create function seller_save_private.guard_transaction_contact() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if row(new.seller_name,new.seller_email,new.seller_phone) is distinct from row(old.seller_name,old.seller_email,old.seller_phone)
   and not exists(select 1 from seller_save_private.authorised_commands where database_transaction=pg_current_xact_id() and transaction_id=new.id) then
   raise exception using errcode='PT409',message='Seller details must be saved through the current seller editor. Reload the seller details before saving.';
 end if;
 return new;
end $$;
create trigger transaction_seller_contact_guard before update on public.transactions
 for each row execute function seller_save_private.guard_transaction_contact();
create function seller_save_private.guard_form_contact() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if row(new.form_data->'seller_name',new.form_data->'seller_email',new.form_data->'seller_phone',new.form_data#>'{__bridge_transaction_parties,seller}')
   is distinct from row(old.form_data->'seller_name',old.form_data->'seller_email',old.form_data->'seller_phone',old.form_data#>'{__bridge_transaction_parties,seller}')
   and not exists(select 1 from seller_save_private.authorised_commands where database_transaction=pg_current_xact_id() and transaction_id=new.transaction_id) then
   raise exception using errcode='PT409',message='Seller details changed. Reload the transaction before saving this form.';
 end if;
 return new;
end $$;
create trigger transaction_seller_form_guard before update on public.onboarding_form_data
 for each row execute function seller_save_private.guard_form_contact();

create function seller_save_private.guard_participant_contact() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
   if (new.seller_source_onboarding_id is not null or new.seller_source_contact_key is not null)
     and not exists(select 1 from seller_save_private.authorised_commands where database_transaction=pg_current_xact_id() and transaction_id=new.transaction_id) then
     raise exception using errcode='PT409',message='Confirm the seller contact source through a reviewed link.';
   end if;
   return new;
 end if;
 if (old.role_type='seller' or new.role_type='seller') and
   row(new.participant_name,new.participant_email,new.participant_phone,new.seller_source_onboarding_id,new.seller_source_contact_key,new.transaction_id,new.role_type,new.id)
   is distinct from row(old.participant_name,old.participant_email,old.participant_phone,old.seller_source_onboarding_id,old.seller_source_contact_key,old.transaction_id,old.role_type,old.id)
   and not exists(select 1 from seller_save_private.authorised_commands where database_transaction=pg_current_xact_id() and transaction_id=new.transaction_id) then
   raise exception using errcode='PT409',message='Update the identified seller through the seller details editor.';
 end if;
 return new;
end $$;
create trigger transaction_seller_person_guard before insert or update on public.transaction_participants
 for each row execute function seller_save_private.guard_participant_contact();

-- Projection is atomic with every existing guarded seller/agent capture save.
-- Only explicitly linked people are projected. An unlinked legacy roster is
-- left for review; its contact editor fails closed above.
create function seller_save_private.project_contact() returns trigger
language plpgsql security definer set search_path='' as $$
declare t public.transactions%rowtype; p public.transaction_participants%rowtype; f public.onboarding_form_data%rowtype;
 name text; email text; phone text; contact_name text; people jsonb; person jsonb; person_count int; projected jsonb; now_at timestamptz:=clock_timestamp();
begin
 if new.form_data is not distinct from old.form_data and new.canonical_facts_json is not distinct from old.canonical_facts_json then return new; end if;
 name:=coalesce(new.canonical_facts_json#>>'{seller,name}',new.form_data->>'sellerName','');
 email:=case when new.form_data ? 'email' then coalesce(new.form_data->>'email','') else coalesce(new.form_data->>'sellerEmail',new.canonical_facts_json#>>'{seller,contact,email}','') end;
 phone:=case when new.form_data ? 'phone' then coalesce(new.form_data->>'phone','') else coalesce(new.form_data->>'sellerPhone',new.form_data->>'mobile',new.canonical_facts_json#>>'{seller,contact,phone}','') end;
 contact_name:=coalesce(new.canonical_facts_json#>>'{seller,contact,name}',new.form_data->>'primaryContactName',new.form_data->>'contactName',name);
 for t in select * from public.transactions where listing_id=new.private_listing_id order by id for update loop
   perform seller_save_private.authorise(t.id);
   update public.transactions set seller_name=name,seller_email=email,seller_phone=phone,updated_at=now_at where id=t.id;
   select * into f from public.onboarding_form_data where transaction_id=t.id for update;
   if f.id is null then
     insert into public.onboarding_form_data(transaction_id,purchaser_type,form_data,updated_at)
       values(t.id,coalesce(t.purchaser_type,'individual'),jsonb_build_object('seller_name',name,'seller_email',email,'seller_phone',phone),now_at) returning * into f;
   end if;
   projected:=coalesce(f.form_data,'{}') || jsonb_build_object('seller_name',name,'seller_email',email,'seller_phone',phone);
   people:=projected#>'{__bridge_transaction_parties,seller,people}';
   -- A single natural-person contact has an unambiguous structural source;
   -- persist that reference before projecting subsequent portal/agent saves.
   if coalesce(new.canonical_facts_json#>>'{seller,owner_structure_type}',new.ownership_structure,new.seller_type,'unknown') in ('individual','foreign_individual','married_cop','married_anc')
      and jsonb_array_length(coalesce(new.form_data->'multipleOwners',new.form_data->'owners','[]'))=0
      and (select count(*) from public.transaction_participants where transaction_id=t.id and role_type='seller' and removed_at is null)=1 then
     update public.transaction_participants tp set seller_source_onboarding_id=new.id,seller_source_contact_key='primary_contact'
       where tp.transaction_id=t.id and tp.role_type='seller' and tp.removed_at is null and tp.seller_source_onboarding_id is null and tp.seller_source_contact_key is null
       and (people is null or (select count(*) from jsonb_array_elements(people) item where item->>'primaryContact'='true')=1
         and exists(select 1 from jsonb_array_elements(people) item where item->>'primaryContact'='true' and item->>'id'=tp.id::text));
   end if;
   for p in select * from public.transaction_participants where transaction_id=t.id and role_type='seller' and removed_at is null
       and seller_source_onboarding_id=new.id and seller_source_contact_key='primary_contact' for update loop
     update public.transaction_participants set participant_name=contact_name,participant_email=nullif(email,''),participant_phone=nullif(phone,''),updated_at=now_at where id=p.id;
     if jsonb_typeof(people)='array' then
       select count(*) into person_count from jsonb_array_elements(people) item where item->>'id'=p.id::text;
       if person_count<>1 then raise exception using errcode='PT409',message='The saved primary seller person link needs review.'; end if;
       select jsonb_agg(case when item->>'id'=p.id::text then item || jsonb_build_object('name',contact_name,'email',email,'phone',phone) else item end order by ord)
         into people from jsonb_array_elements(people) with ordinality items(item,ord);
     end if;
   end loop;
   if jsonb_typeof(people)='array' then projected:=jsonb_set(projected,'{__bridge_transaction_parties,seller,people}',people); end if;
   if projected#>'{__bridge_transaction_parties,seller}' is not null then projected:=jsonb_set(projected,'{__bridge_transaction_parties,seller,name}',to_jsonb(name)); end if;
   update public.onboarding_form_data set form_data=projected,updated_at=now_at where id=f.id;
   delete from seller_save_private.authorised_commands where database_transaction=pg_current_xact_id() and transaction_id=t.id;
 end loop;
 return new;
end $$;
create trigger seller_current_transaction_contacts after update on public.private_listing_seller_onboarding
 for each row execute function seller_save_private.project_contact();

create function seller_save_private.save_contact(p_tx uuid,p_revision jsonb,p_patch jsonb,p_mutation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb; receipt jsonb; request jsonb:=jsonb_build_object('revision',p_revision,'patch',p_patch);
 replay seller_save_private.transaction_receipts%rowtype; t public.transactions%rowtype; o public.private_listing_seller_onboarding%rowtype;
 p public.transaction_participants%rowtype; f public.onboarding_form_data%rowtype; form jsonb; facts jsonb; details jsonb;
 name text; email text; phone text; now_at timestamptz:=clock_timestamp();
begin
 if auth.uid() is null or p_mutation is null then raise exception using errcode='42501',message='A signed-in seller editor and save reference are required.'; end if;
 context:=seller_save_private.edit_context(p_tx);
 select * into replay from seller_save_private.transaction_receipts where mutation_id=p_mutation;
 if found then
   if replay.actor_id<>auth.uid() or replay.transaction_id<>p_tx or replay.request<>request then raise exception using errcode='PT409',message='This save reference belongs to a different change.'; end if;
   return replay.receipt;
 end if;
 if context->>'blockedReason' is not null then raise exception using errcode='PT409',message=context->>'blockedReason'; end if;
 if context->'revision' is distinct from p_revision then raise exception using errcode='PT409',message='Someone else saved changes to this seller record. Your entries are still in this form. Review the latest saved details before trying again.'; end if;
 if jsonb_typeof(p_patch)<>'object' or p_patch='{}' or exists(select 1 from jsonb_each(p_patch) x where x.key not in ('name','email','phone') or jsonb_typeof(x.value)<>'string') then
   raise exception using errcode='22023',message='Only changed seller contact fields may be saved here.';
 end if;
 if p_patch ? 'name' and not (context->>'nameEditable')::boolean then raise exception using errcode='42501',message='Review legal seller names in the listing seller profile.'; end if;
 details:=context->'details' || p_patch;
 name:=btrim(details->>'name'); email:=lower(btrim(details->>'email')); phone:=btrim(details->>'phone');
 if p_patch ? 'name' and name='' then raise exception using errcode='22023',message='The seller name cannot be empty.'; end if;
 select * into t from public.transactions where id=p_tx;
 select * into p from public.transaction_participants where id=(p_revision->>'participantId')::uuid;
 if nullif(p_revision->>'onboardingId','') is not null then
   select * into o from public.private_listing_seller_onboarding where id=(p_revision->>'onboardingId')::uuid;
   -- Phase 2's editor is the captured primary contact. Complex source-person
   -- edits remain in the listing profile until the Phase 3 handoff adapter.
   if p_revision->>'sourceContactKey'<>'primary_contact' then raise exception using errcode='PT409',message='Edit this individual owner in the listing seller profile until the transaction person link has been reviewed.'; end if;
   perform seller_save_private.authorise(p_tx);
   update public.transaction_participants set seller_source_onboarding_id=o.id,seller_source_contact_key='primary_contact' where id=p.id;
   form:=coalesce(o.form_data,'{}'); facts:=coalesce(o.canonical_facts_json,'{}');
   if p_patch ? 'email' then form:=form || jsonb_build_object('email',email,'sellerEmail',email); end if;
   if p_patch ? 'phone' then form:=form || jsonb_build_object('phone',phone,'sellerPhone',phone,'mobile',phone); end if;
   facts:=jsonb_set(facts,'{seller}',coalesce(facts->'seller','{}') || jsonb_build_object('email',email,'phone',phone,
     'contact',coalesce(facts#>'{seller,contact}','{}') || jsonb_build_object('email',email,'phone',phone)));
   form:=form || jsonb_build_object('canonicalSellerFacts',facts,'canonical_seller_facts',facts);
   update public.private_listing_seller_onboarding set form_data=form,canonical_facts_json=facts,canonical_facts_updated_at=now_at,updated_at=now_at where id=o.id;
   update public.private_listings set seller_canonical_facts_json=facts,seller_canonical_facts_updated_at=now_at,updated_at=now_at where id=t.listing_id;
 else
   perform seller_save_private.authorise(p_tx);
   update public.transactions set seller_name=name,seller_email=email,seller_phone=phone,updated_at=now_at where id=p_tx;
   update public.transaction_participants set participant_name=name,participant_email=nullif(email,''),participant_phone=nullif(phone,''),updated_at=now_at where id=p.id;
   select * into f from public.onboarding_form_data where transaction_id=p_tx;
   form:=coalesce(f.form_data,'{}') || jsonb_build_object('seller_name',name,'seller_email',email,'seller_phone',phone);
   if form#>'{__bridge_transaction_parties,seller,people}' is not null then
     select jsonb_agg(case when item->>'id'=p.id::text then item || jsonb_build_object('name',name,'email',email,'phone',phone) else item end order by ord)
       into facts from jsonb_array_elements(form#>'{__bridge_transaction_parties,seller,people}') with ordinality items(item,ord);
     form:=jsonb_set(form,'{__bridge_transaction_parties,seller,people}',facts);
     form:=jsonb_set(form,'{__bridge_transaction_parties,seller,name}',to_jsonb(name));
   end if;
   insert into public.onboarding_form_data(transaction_id,purchaser_type,form_data,updated_at) values(p_tx,coalesce(t.purchaser_type,'individual'),form,now_at)
     on conflict(transaction_id) do update set form_data=excluded.form_data,updated_at=excluded.updated_at;
   delete from seller_save_private.authorised_commands where database_transaction=pg_current_xact_id() and transaction_id=p_tx;
 end if;
 receipt:=seller_save_private.edit_context(p_tx) || jsonb_build_object('mutationId',p_mutation);
 insert into seller_save_private.transaction_receipts(mutation_id,actor_id,transaction_id,request,receipt) values(p_mutation,auth.uid(),p_tx,request,receipt);
 return receipt;
end $$;

create function public.bridge_get_transaction_seller_edit_context(p_transaction_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select seller_save_private.edit_context(p_transaction_id)$$;
create function public.bridge_save_transaction_seller_details(p_transaction_id uuid,p_revision jsonb,p_patch jsonb,p_mutation_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select seller_save_private.save_contact(p_transaction_id,p_revision,p_patch,p_mutation_id)$$;
revoke all on all functions in schema seller_save_private from public,anon,authenticated;
grant execute on function seller_save_private.edit_context(uuid),seller_save_private.save_contact(uuid,jsonb,jsonb,uuid) to authenticated;
revoke all on function public.bridge_get_transaction_seller_edit_context(uuid),public.bridge_save_transaction_seller_details(uuid,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.bridge_get_transaction_seller_edit_context(uuid),public.bridge_save_transaction_seller_details(uuid,jsonb,jsonb,uuid) to authenticated;

create function public.bridge_advance_seller_workflow(p_listing_id uuid,p_action text,p_at timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare o public.private_listing_seller_onboarding%rowtype; workflow jsonb; target text; stage text;
 stages text[]:=array['onboarding_sent','basic_intake_submitted','fica_documents_requested','documents_prepared','signatures_in_progress','agency_review','complete'];
 now_at timestamptz:=coalesce(p_at,clock_timestamp()); creation jsonb;
begin
 if auth.uid() is null or not public.bridge_can_access_private_listing(p_listing_id) then raise exception using errcode='42501',message='Seller workflow update is not permitted.'; end if;
 perform 1 from public.private_listings where id=p_listing_id for update;
 select * into o from public.private_listing_seller_onboarding where private_listing_id=p_listing_id for update;
 if o.id is null then return null; end if;
 target:=case p_action when 'fica_requested' then 'fica_documents_requested' when 'mandate_signed' then 'documents_prepared' end;
 if target is null then raise exception using errcode='22023',message='Unknown seller workflow action.'; end if;
 workflow:=coalesce(o.form_data->'sellerWorkflow',o.form_data->'seller_workflow','{}'); stage:=workflow->>'stage';
 if coalesce(array_position(stages,stage),0)<array_position(stages,target) then
   workflow:=workflow || jsonb_build_object('contract','arch9-seller-workflow-state-v1','stage',target,'updatedAt',now_at,'updatedBy',auth.uid(),
     'history',coalesce(workflow->'history','[]') || jsonb_build_array(jsonb_build_object('stage',target,'at',now_at,'actor',auth.uid())));
 end if;
 creation:=case when p_action='mandate_signed' then jsonb_build_object('sellerListingCreation',jsonb_build_object('status','created','createdAt',now_at,'created_at',now_at,'source','signed_mandate_upload'),
   'seller_listing_creation',jsonb_build_object('status','created','createdAt',now_at,'created_at',now_at,'source','signed_mandate_upload')) else '{}'::jsonb end;
 update public.private_listing_seller_onboarding set form_data=coalesce(o.form_data,'{}') || jsonb_build_object('sellerWorkflow',workflow) || creation,updated_at=clock_timestamp()
   where id=o.id returning * into o;
 return jsonb_build_object('id',o.id,'form_data',o.form_data);
end $$;
revoke all on function public.bridge_advance_seller_workflow(uuid,text,timestamptz) from public,anon;
grant execute on function public.bridge_advance_seller_workflow(uuid,text,timestamptz) to authenticated;

-- A seller-only save may follow an unrelated listing operation. Do not copy
-- the editor's older address/price/mandate summary back into the listing.
do $listing_patch$
declare definition text; anchor text:='if coalesce(p_listing_patch ->> ''askingPrice'', '''') ~';
 filter text:=$body$if coalesce(p_form_data,'{}'::jsonb) ? '__sellerSave' then
    if not (coalesce(p_changed_fields,'{}'::text[]) && array['propertyAddress','addressLine1']) then p_listing_patch:=p_listing_patch-'propertyAddress'-'addressLine1'; end if;
    if not (coalesce(p_changed_fields,'{}'::text[]) && array['askingPrice','price']) then p_listing_patch:=p_listing_patch-'askingPrice'; end if;
    if not ('mandateType'=any(coalesce(p_changed_fields,'{}'::text[]))) then p_listing_patch:=p_listing_patch-'mandateType'; end if;
    if (coalesce(p_changed_fields,'{}'::text[]) && array['propertyAddress','addressLine1','askingPrice','price','mandateType'])
      and v_listing.updated_at is distinct from p_expected_updated_at then
      raise exception using errcode='PT409',message='The listing details changed. Review the latest listing before saving these property or mandate changes.';
    end if;
  end if;
  $body$;
begin
 definition:=pg_get_functiondef('public.save_private_listing_seller_canonical_update(uuid,jsonb,jsonb,jsonb,jsonb,text,text,text,text,uuid,text,text,text[],timestamptz)'::regprocedure);
 if position(anchor in definition)=0 then raise exception 'Seller canonical save changed. Review its listing projection before applying.'; end if;
 execute replace(definition,anchor,filter||anchor);
end $listing_patch$;

-- Preserve the established preparation side effects behind a checked wrapper.
do $copy$
declare original text;
begin
 original:=pg_get_functiondef('public.bridge_prepare_seller_onboarding_link(uuid,text,timestamptz,jsonb,text,text,text,uuid)'::regprocedure);
 execute replace(original,'FUNCTION public.bridge_prepare_seller_onboarding_link(', 'FUNCTION seller_save_private.prepare_link_before_guard(');
end $copy$;
revoke all on function seller_save_private.prepare_link_before_guard(uuid,text,timestamptz,jsonb,text,text,text,uuid) from public,anon,authenticated;
create function seller_save_private.prepare_link(p_listing_id uuid,p_token text,p_expiry timestamptz,p_form jsonb,p_type text,p_structure text,p_marital text,p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.private_listings%rowtype; o public.private_listing_seller_onboarding%rowtype; revision jsonb:=p_form->'__sellerSave'; result jsonb;
begin
 if auth.uid() is null or not public.bridge_can_access_private_listing(p_listing_id) then raise exception using errcode='42501',message='Seller link preparation is not permitted.'; end if;
 select * into l from public.private_listings where id=p_listing_id for update;
 if not public.bridge_listing_seller_actor_permission(l.organisation_id,'review_change','legal_identity') then raise exception using errcode='42501',message='Seller link preparation is not permitted.'; end if;
 if (select count(*) from public.private_listing_seller_onboarding where private_listing_id=p_listing_id)>1 then raise exception using errcode='PT409',message='The seller profile link needs review.'; end if;
 select * into o from public.private_listing_seller_onboarding where private_listing_id=p_listing_id for update;
 if revision is null or not (revision ? 'updatedAt') or o.id::text is distinct from revision->>'onboardingId'
   or o.updated_at is distinct from nullif(revision->>'updatedAt','')::timestamptz then
   raise exception using errcode='PT409',message='Someone else saved changes to this seller record. Review the latest seller details before preparing the link.';
 end if;
 if o.status='completed' or o.submitted_at is not null then
   return jsonb_build_object('listing',to_jsonb(l),'onboarding',to_jsonb(o)-'seller_portal_password_hash'-'seller_portal_access_token_hash'-'seller_portal_invite_token_hash'-'seller_portal_recovery_token_hash');
 end if;
 if revision->>'deferStatusTransition'='true' then
   result:=public.save_private_listing_seller_onboarding_profile(p_listing_id,p_token,p_form-'__sellerSave',revision,coalesce(o.status,'sent'),p_type,p_structure,p_marital,false,false);
   update public.private_listing_seller_onboarding set token_expires_at=p_expiry where id=(result->>'id')::uuid;
   result:=jsonb_build_object('onboarding',result);
 else
   result:=seller_save_private.prepare_link_before_guard(p_listing_id,p_token,p_expiry,p_form-'__sellerSave',p_type,p_structure,p_marital,auth.uid());
 end if;
 if p_form ? 'canonicalSellerFacts' then
   update public.private_listing_seller_onboarding set canonical_facts_json=p_form->'canonicalSellerFacts',
     canonical_fact_readiness_json=coalesce(p_form->'canonicalSellerFactReadiness',canonical_fact_readiness_json),canonical_facts_updated_at=clock_timestamp()
     where id=(result#>>'{onboarding,id}')::uuid returning * into o;
   update public.private_listings set seller_canonical_facts_json=o.canonical_facts_json,seller_canonical_fact_readiness_json=o.canonical_fact_readiness_json,
     seller_canonical_facts_updated_at=o.canonical_facts_updated_at where id=p_listing_id;
   result:=result || jsonb_build_object('onboarding',to_jsonb(o)-'seller_portal_password_hash'-'seller_portal_access_token_hash'-'seller_portal_invite_token_hash'-'seller_portal_recovery_token_hash');
 end if;
 return result;
end $$;
create or replace function public.bridge_prepare_seller_onboarding_link(p_listing_id uuid,p_token text,p_token_expires_at timestamptz,p_form_data jsonb default '{}',p_seller_type text default null,p_ownership_structure text default null,p_marital_regime text default null,p_performed_by uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select seller_save_private.prepare_link(p_listing_id,p_token,p_token_expires_at,p_form_data,p_seller_type,p_ownership_structure,p_marital_regime,p_performed_by)$$;
revoke all on function seller_save_private.prepare_link(uuid,text,timestamptz,jsonb,text,text,text,uuid) from public,anon;
grant execute on function seller_save_private.prepare_link(uuid,text,timestamptz,jsonb,text,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
