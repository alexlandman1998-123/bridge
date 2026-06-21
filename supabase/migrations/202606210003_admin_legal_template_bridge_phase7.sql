begin;

-- Phase 7: allow the Arch9 admin panel to manage organisation legal templates.
-- Organisation admins remain covered by the Phase 1/2 policies; this adds a
-- platform-admin bridge for the central admin app.

create or replace function public.bridge_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in (
        'platform_admin',
        'super_admin',
        'internal_admin',
        'admin',
        'developer',
        'executive',
        'executive_level',
        'founder',
        'hq_staff'
      )
  )
  or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) in (
    'platform_admin',
    'super_admin',
    'internal_admin',
    'admin',
    'developer',
    'executive',
    'executive_level',
    'founder',
    'hq_staff'
  )
  or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '')) in (
    'platform_admin',
    'super_admin',
    'internal_admin',
    'admin',
    'developer',
    'executive',
    'executive_level',
    'founder',
    'hq_staff'
  );
$$;

grant execute on function public.bridge_is_platform_admin() to authenticated;

drop policy if exists document_packet_templates_platform_admin_select on public.document_packet_templates;
create policy document_packet_templates_platform_admin_select
on public.document_packet_templates
for select
to authenticated
using (public.bridge_is_platform_admin());

drop policy if exists document_packet_templates_platform_admin_write on public.document_packet_templates;
create policy document_packet_templates_platform_admin_write
on public.document_packet_templates
for all
to authenticated
using (public.bridge_is_platform_admin())
with check (public.bridge_is_platform_admin());

drop policy if exists document_packet_template_versions_platform_admin_select on public.document_packet_template_versions;
create policy document_packet_template_versions_platform_admin_select
on public.document_packet_template_versions
for select
to authenticated
using (public.bridge_is_platform_admin());

drop policy if exists document_packet_template_versions_platform_admin_write on public.document_packet_template_versions;
create policy document_packet_template_versions_platform_admin_write
on public.document_packet_template_versions
for all
to authenticated
using (public.bridge_is_platform_admin())
with check (public.bridge_is_platform_admin());

drop policy if exists document_packet_template_audit_platform_admin_select on public.document_packet_template_audit;
create policy document_packet_template_audit_platform_admin_select
on public.document_packet_template_audit
for select
to authenticated
using (public.bridge_is_platform_admin());

drop policy if exists document_packet_template_audit_platform_admin_insert on public.document_packet_template_audit;
create policy document_packet_template_audit_platform_admin_insert
on public.document_packet_template_audit
for insert
to authenticated
with check (public.bridge_is_platform_admin());

drop policy if exists legal_templates_platform_admin_insert on storage.objects;
create policy legal_templates_platform_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'legal-templates'
  and public.bridge_is_legal_template_storage_path(name)
  and public.bridge_is_platform_admin()
);

drop policy if exists legal_templates_platform_admin_update on storage.objects;
create policy legal_templates_platform_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'legal-templates'
  and public.bridge_is_legal_template_storage_path(name)
  and public.bridge_is_platform_admin()
)
with check (
  bucket_id = 'legal-templates'
  and public.bridge_is_legal_template_storage_path(name)
  and public.bridge_is_platform_admin()
);

drop policy if exists legal_templates_platform_admin_delete on storage.objects;
create policy legal_templates_platform_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'legal-templates'
  and public.bridge_is_legal_template_storage_path(name)
  and public.bridge_is_platform_admin()
);

drop policy if exists legal_templates_platform_admin_read on storage.objects;
create policy legal_templates_platform_admin_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'legal-templates'
  and public.bridge_is_legal_template_storage_path(name)
  and public.bridge_is_platform_admin()
);

commit;
