-- Known company/trust classifications cannot be overridden by a filename or
-- category intended for Deeds registration evidence. No record backfill.
create or replace function journey_private.is_registration_confirmation_document(d public.documents)
returns boolean language sql immutable set search_path='' as $$
 select case when lower(coalesce(d.document_type,'')) ~ '(company|companies|cipc|trust)' then false else
 lower(coalesce(d.document_type,'')) in
 ('registration_confirmation','registration_confirmation_document','deeds_registration_confirmation',
  'deeds_office_registration_confirmation','registration_proof','deeds_registration_proof','registered_title_deed')
 or lower(coalesce(d.category,''))='registration_confirmation'
 or ((coalesce(d.name,'') ~* '(registration confirmation|confirmation of registration|proof of deeds registration|deeds office registration)')
 and coalesce(d.name,'') !~* '(company|companies|cipc|trust registration)') end;
$$;
revoke all on function journey_private.is_registration_confirmation_document(public.documents) from public,anon,authenticated;
