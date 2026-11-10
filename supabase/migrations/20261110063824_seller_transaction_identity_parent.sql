begin;
-- Fix transaction-to-client identity selection only. Existing source links and
-- reviewed merges remain stable; historical corrections require explicit review.
CREATE OR REPLACE FUNCTION arch9_client_private.ingest(p_table text, p_row jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid:=(p_row->>'organisation_id')::uuid; v_id uuid; v_contact public.contacts%rowtype; v_buyer public.buyers%rowtype; v_facts jsonb; v_form jsonb; v_listing jsonb; v_parent uuid;
begin
  if coalesce((p_row->>'is_demo_data')::boolean,false) or coalesce((p_row->>'isDemoData')::boolean,false)
    or p_row->'demo_metadata' @> '{"isDemoData":true}'::jsonb
    or p_row->'demo_metadata' @> '{"is_demo_data":true}'::jsonb
    or p_row->'demo_metadata' @> '{"seedData":true}'::jsonb
    or p_row->'demo_metadata' @> '{"seed_data":true}'::jsonb
    or p_row->'demo_metadata' @> '{"migratedFromLocalStorage":true}'::jsonb then return; end if;
  case p_table
    when 'contacts' then
      perform arch9_client_private.attach_source(v_org,'contact',(p_row->>'contact_id')::uuid,concat_ws(' ',p_row->>'first_name',p_row->>'last_name'),p_row->>'email',p_row->>'phone');
    when 'leads' then
      select * into v_contact from public.contacts where contact_id=(p_row->>'contact_id')::uuid and organisation_id=v_org;
      if v_contact.contact_id is not null then
        perform arch9_client_private.attach_source(v_org,'lead',(p_row->>'lead_id')::uuid,concat_ws(' ',v_contact.first_name,v_contact.last_name),v_contact.email,v_contact.phone,'contact',v_contact.contact_id);
      end if;
    when 'buyers' then
      perform arch9_client_private.attach_source(v_org,'buyer',(p_row->>'id')::uuid,p_row->>'name',p_row->>'email',p_row->>'phone');
    when 'canvassing_prospects' then
      perform arch9_client_private.attach_source(v_org,'prospect',(p_row->>'id')::uuid,concat_ws(' ',p_row->>'first_name',p_row->>'last_name'),p_row->>'email',p_row->>'phone');
    when 'transactions' then
      v_id:=(p_row->>'id')::uuid;
      select * into v_buyer from public.buyers where id=(p_row->>'buyer_id')::uuid and organisation_id=v_org;
      if v_buyer.id is not null and not coalesce((to_jsonb(v_buyer)->>'is_demo_data')::boolean,false) then
        perform arch9_client_private.attach_source(v_org,'transaction_buyer',v_id,v_buyer.name,v_buyer.email,v_buyer.phone,'buyer',v_buyer.id);
      end if;
      -- A transaction seller is the legal owner of its linked listing.
      -- An email may belong to an executor/representative or another client.
      -- Do not use that contact address to choose or enrich the owner's identity.
      select to_jsonb(l) into v_listing from public.private_listings l
        where l.id::text=nullif(p_row->>'listing_id','') and l.organisation_id=v_org;
      if v_listing is not null then
        perform arch9_client_private.ingest('private_listings',v_listing);
        perform arch9_client_private.attach_source(v_org,'transaction_seller',v_id,
          p_row->>'seller_name',null,null,'listing_seller',(v_listing->>'id')::uuid);
      else
        -- Without an authoritative listing relationship, retain an existing
        -- source identity or create a separate one; never guess by email.
        perform arch9_client_private.attach_source(v_org,'transaction_seller',v_id,
          p_row->>'seller_name',null,null);
      end if;
    when 'private_listing_seller_onboarding' then
      select to_jsonb(l) into v_listing from public.private_listings l where l.id=(p_row->>'private_listing_id')::uuid;
      if v_listing is not null then perform arch9_client_private.ingest('private_listings',v_listing); end if;
    when 'private_listings' then
      select coalesce(canonical_facts_json,'{}'::jsonb)||coalesce(form_data,'{}'::jsonb) into v_form from public.private_listing_seller_onboarding where private_listing_id=(p_row->>'id')::uuid limit 1;
      v_form:=coalesce(v_form,'{}'::jsonb);
      v_facts:=coalesce(p_row->'seller_canonical_facts_json','{}'::jsonb);
      if (p_row->>'seller_lead_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_parent:=(p_row->>'seller_lead_id')::uuid; end if;
      perform arch9_client_private.attach_source(v_org,'listing_seller',(p_row->>'id')::uuid,
        coalesce(nullif(v_facts->>'fullName',''),nullif(v_facts->>'sellerName',''),nullif(v_facts->>'name',''),nullif(trim(concat_ws(' ',v_facts->>'firstName',v_facts->>'lastName')),''),nullif(v_form->>'sellerName',''),nullif(v_form->>'fullName',''),nullif(trim(concat_ws(' ',coalesce(v_form->>'sellerFirstName',v_form->>'firstName'),coalesce(v_form->>'sellerSurname',v_form->>'lastName'))),'')),
        coalesce(v_facts->>'email',v_facts->>'sellerEmail',v_form->>'sellerEmail',v_form->>'email',v_form->>'contactEmail'),coalesce(v_facts->>'phone',v_facts->>'sellerPhone',v_facts->>'mobile',v_form->>'sellerPhone',v_form->>'phone',v_form->>'contactNumber',v_form->>'mobile'),'lead',v_parent);
  end case;
end;
$function$;

CREATE OR REPLACE FUNCTION arch9_client_private.source_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_transaction jsonb; v_org uuid; v_old_org uuid;
begin
  v_org:=(to_jsonb(new)->>'organisation_id')::uuid;
  if tg_op='UPDATE' then v_old_org:=(to_jsonb(old)->>'organisation_id')::uuid; end if;
  if v_org is not null and v_old_org is not null and v_org<>v_old_org then
    perform pg_advisory_xact_lock(hashtextextended(least(v_org,v_old_org)::text,0));
    perform pg_advisory_xact_lock(hashtextextended(greatest(v_org,v_old_org)::text,0));
  elsif v_org is not null then perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
  end if;
  if tg_op='UPDATE' then
    if tg_table_name='transactions' and (to_jsonb(old)->>'listing_id') is distinct from (to_jsonb(new)->>'listing_id') then
      delete from public.agency_client_links where source_kind='transaction_seller'
        and source_id=(to_jsonb(old)->>'id')::uuid and organisation_id=(to_jsonb(old)->>'organisation_id')::uuid;
    end if;
    if tg_table_name='transactions' and (to_jsonb(old)->>'buyer_id') is distinct from (to_jsonb(new)->>'buyer_id') then
      delete from public.agency_client_links where source_kind='transaction_buyer' and source_id=(to_jsonb(old)->>'id')::uuid and organisation_id=(to_jsonb(old)->>'organisation_id')::uuid;
    elsif tg_table_name='leads' and (to_jsonb(old)->>'contact_id') is distinct from (to_jsonb(new)->>'contact_id') then
      delete from public.agency_client_links where source_kind='lead' and source_id=(to_jsonb(old)->>'lead_id')::uuid and organisation_id=(to_jsonb(old)->>'organisation_id')::uuid;
    elsif tg_table_name='private_listings' and (to_jsonb(old)->>'seller_lead_id') is distinct from (to_jsonb(new)->>'seller_lead_id') then
      delete from public.agency_client_links where source_kind='listing_seller' and source_id=(to_jsonb(old)->>'id')::uuid and organisation_id=(to_jsonb(old)->>'organisation_id')::uuid;
    end if;
  end if;
  if tg_op='UPDATE' and (to_jsonb(old)->>'organisation_id') is distinct from (to_jsonb(new)->>'organisation_id') then
    delete from public.agency_client_links where organisation_id=(to_jsonb(old)->>'organisation_id')::uuid
      and source_id=coalesce(to_jsonb(old)->>'id',to_jsonb(old)->>'lead_id',to_jsonb(old)->>'contact_id')::uuid
      and source_kind=any(case tg_table_name when 'contacts' then array['contact'] when 'leads' then array['lead'] when 'buyers' then array['buyer'] when 'canvassing_prospects' then array['prospect'] when 'private_listings' then array['listing_seller'] else array['transaction_buyer','transaction_seller'] end);
  end if;
  perform arch9_client_private.ingest(tg_table_name,to_jsonb(new));
  if tg_table_name='buyers' then
    for v_transaction in select to_jsonb(t) from public.transactions t where t.buyer_id=(to_jsonb(new)->>'id')::uuid loop
      perform arch9_client_private.ingest('transactions',v_transaction);
    end loop;
  end if;
  return new;
end;
$function$;

revoke all on function arch9_client_private.ingest(text,jsonb),arch9_client_private.source_trigger() from public,anon,authenticated;
drop trigger agency_client_identity_sync on public.transactions;
create trigger agency_client_identity_sync
 after insert or update of organisation_id,buyer_id,seller_name,seller_email,seller_phone,listing_id
 on public.transactions for each row execute function arch9_client_private.source_trigger();
notify pgrst,'reload schema';
commit;
