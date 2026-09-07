drop policy if exists developer_document_portal_links_deny_direct_access on public.developer_document_portal_links;
create policy developer_document_portal_links_deny_direct_access
on public.developer_document_portal_links
for all to anon, authenticated
using (false)
with check (false);
