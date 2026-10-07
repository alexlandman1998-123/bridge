begin;
-- An aggregate over zero assigned files returns a row. Do not mark that empty
-- result uploaded: let the requirement fall back to requested/missing.
create or replace view public.rental_onboarding_requirement_summaries with(security_invoker=true) as
select r.id,r.checklist_id,r.subject_id,r.scope_key,r.purpose,r.required,r.active,r.generation,r.discovery_revision,r.fingerprint_json,r.current_document_id,r.requested_at,r.expires_at,
 c.organisation_id,c.application_id,c.landlord_lead_id,c.mode,c.rule_version,
 case when not r.active then 'superseded' when r.expires_at<=now() then 'expired'
 when r.purpose='signed_consent' and exists(select 1 from public.rental_application_person_permissions pp join public.rental_applications pa on pa.id=pp.application_id where pp.requirement_id=r.id and pp.generation=r.generation and pp.submission_at=pa.submitted_at) then 'accepted'
 when coalesce(pack.status,d.status,l.status)='accepted' then 'accepted' when coalesce(pack.status,d.status,l.status)='rejected' then 'rejected'
 when coalesce(pack.status,d.status,l.status)='uploaded' then 'received' when r.requested_at is not null then 'requested' else 'missing' end state,
 r.current_landlord_document_id
from public.rental_onboarding_requirements r join public.rental_onboarding_checklists c on c.id=r.checklist_id
left join public.rental_application_documents d on d.id=r.current_document_id
left join public.rental_landlord_onboarding_documents l on l.id=r.current_landlord_document_id
left join lateral(select case when count(*)=0 then null when bool_or(b.status='rejected') then 'rejected' when bool_and(b.status='accepted') then 'accepted' else 'uploaded' end status from public.rental_application_documents b join public.rental_onboarding_evidence_assignments e on e.document_id=b.id where e.requirement_id=r.id and e.generation=r.generation and b.intake_bundle_id=d.intake_bundle_id) pack on true;

commit;
