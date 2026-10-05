begin;
create table public.recruitment_leads (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null check (length(trim(name)) between 2 and 120),
  email text not null default '',
  phone text not null default '',
  area text not null default '',
  source text not null default 'Manual',
  status text not null default 'new' check (status in ('new','contacted','interview','onboarding','joined','closed_lost')),
  details_json jsonb not null default '{}' check (jsonb_typeof(details_json) = 'object'),
  documents_json jsonb not null default '[]' check (jsonb_typeof(documents_json) = 'array'),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recruitment_leads_org_created_idx on public.recruitment_leads(organisation_id, created_at desc);
alter table public.recruitment_leads enable row level security;
revoke all on public.recruitment_leads from public, anon, authenticated;
grant select, insert, update on public.recruitment_leads to authenticated;
grant all on public.recruitment_leads to service_role;
create policy recruitment_leads_management on public.recruitment_leads for all to authenticated
using (exists (select 1 from public.organisation_users m where m.organisation_id = recruitment_leads.organisation_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('principal','admin','super_admin')))
with check (exists (select 1 from public.organisation_users m where m.organisation_id = recruitment_leads.organisation_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.role in ('principal','admin','super_admin')));
create function public.recruitment_lead_stamp() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.organisation_id <> old.organisation_id then raise exception 'Recruitment leads cannot move organisations'; end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.recruitment_lead_stamp() from public, anon, authenticated;
create trigger recruitment_lead_stamp before update on public.recruitment_leads for each row execute function public.recruitment_lead_stamp();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recruitment-documents','recruitment-documents',false,10485760,array['application/pdf','image/jpeg','image/png']);
create policy recruitment_document_read on storage.objects for select to authenticated
using (bucket_id = 'recruitment-documents' and exists (
  select 1 from public.recruitment_leads l where l.organisation_id::text = (storage.foldername(storage.objects.name))[1] and l.id::text = (storage.foldername(storage.objects.name))[2]
));
create policy recruitment_document_insert on storage.objects for insert to authenticated
with check (bucket_id = 'recruitment-documents' and exists (
  select 1 from public.recruitment_leads l where l.organisation_id::text = (storage.foldername(storage.objects.name))[1] and l.id::text = (storage.foldername(storage.objects.name))[2]
));
-- Only for cleaning up an upload whose lead update failed; no delete is exposed in the UI.
create policy recruitment_document_cleanup on storage.objects for delete to authenticated
using (bucket_id = 'recruitment-documents' and owner_id = (select auth.uid())::text and exists (
  select 1 from public.recruitment_leads l where l.organisation_id::text = (storage.foldername(storage.objects.name))[1] and l.id::text = (storage.foldername(storage.objects.name))[2]
));
commit;
