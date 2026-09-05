begin;
create or replace view public.rental_application_review_summaries with (security_invoker = true) as
select a.id, a.organisation_id, a.vacancy_id, a.unit_id, a.status, a.version, a.application_data, a.submitted_at, a.updated_at,
coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,'status',d.status,'name',d.file_name,'uploaded_at',d.uploaded_at) order by d.created_at desc) from public.rental_application_documents d where d.application_id=a.id),'[]'::jsonb) as documents,
coalesce((select jsonb_agg(jsonb_build_object('type',c.consent_type,'version',c.wording_version,'accepted_at',c.accepted_at) order by c.accepted_at desc) from public.rental_application_consents c where c.application_id=a.id),'[]'::jsonb) as consents
from public.rental_applications a;
revoke all on public.rental_application_review_summaries from anon;
grant select on public.rental_application_review_summaries to authenticated;
commit;
