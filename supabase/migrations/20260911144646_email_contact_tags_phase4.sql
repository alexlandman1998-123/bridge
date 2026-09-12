begin;

-- Keep the legacy array projection in sync so existing campaign filters and
-- future relational tag UI always produce the same audience.
create or replace function public.email_sync_marketing_contact_tags()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_contact_id uuid; v_organisation_id uuid;
begin
  v_contact_id := coalesce(new.contact_id, old.contact_id);
  v_organisation_id := coalesce(new.organisation_id, old.organisation_id);
  update public.email_marketing_contacts c
  set tags = coalesce((
    select array_agg(t.slug order by t.slug)
    from public.email_marketing_contact_tags ct
    join public.email_contact_tags t on t.id=ct.tag_id
    where ct.contact_id=v_contact_id and ct.organisation_id=v_organisation_id
  ), '{}'::text[]), updated_at=now()
  where c.id=v_contact_id and c.organisation_id=v_organisation_id;
  return coalesce(new, old);
end $$;

drop trigger if exists email_sync_marketing_contact_tags_trigger on public.email_marketing_contact_tags;
create trigger email_sync_marketing_contact_tags_trigger
after insert or update or delete on public.email_marketing_contact_tags
for each row execute function public.email_sync_marketing_contact_tags();

create or replace function public.email_assign_contact_tag(p_contact_ids uuid[], p_tag_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_org uuid; v_count integer;
begin
  select organisation_id into v_org from public.email_contact_tags where id=p_tag_id;
  if v_org is null or not public.bridge_has_organisation_membership(v_org) then raise exception 'Not authorised.' using errcode='42501'; end if;
  insert into public.email_marketing_contact_tags (organisation_id,contact_id,tag_id,created_by)
  select v_org,c.id,p_tag_id,auth.uid() from public.email_marketing_contacts c
  where c.organisation_id=v_org and c.id=any(coalesce(p_contact_ids,'{}'::uuid[]))
  on conflict do nothing;
  get diagnostics v_count=row_count;
  return v_count;
end $$;

revoke all on function public.email_assign_contact_tag(uuid[],uuid) from public,anon;
grant execute on function public.email_assign_contact_tag(uuid[],uuid) to authenticated;

commit;
