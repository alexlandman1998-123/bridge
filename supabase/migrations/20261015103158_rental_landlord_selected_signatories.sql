begin;

-- Persist a stable person reference, while retaining the legacy scalar signing
-- fields used by saved documents and listings. No stored journey is rewritten.
alter function rental_private.landlord_profile_errors(jsonb,text) rename to landlord_profile_errors_before_selected_signatories;
create function rental_private.landlord_profile_errors(p jsonb,p_phase text default 'draft') returns text[]
language plpgsql immutable set search_path='' as $$
declare errors text[]:=rental_private.landlord_profile_errors_before_selected_signatories(p,p_phase); person jsonb; ref text:=coalesce(btrim(p->>'primarySignatoryId'),''); pair record; expected text;
begin
 if ref='' or not coalesce(rental_private.landlord_profile_representative(p),false) then return errors; end if;
 select x into person from jsonb_array_elements(case when jsonb_typeof(p->'people')='array' then p->'people' else '[]'::jsonb end) x where btrim(x->>'id')=ref;
 if person is null or person->'signingAuthority' is distinct from 'true'::jsonb then
  return array_append(errors,'Choose a current authorised person as the primary signatory, or enter separate signatory details.');
 end if;
 for pair in select * from (values
  ('authorisedSignatoryName','name'),('authorisedSignatoryIdNumber','idNumber'),('authorisedSignatoryNationality','nationality'),('authorisedSignatoryEmail','email'),('authorisedSignatoryPhone','phone'),('authorisedSignatoryCapacity','capacity')
 ) x(profile_key,person_key) loop
  expected:=coalesce(btrim(person->>pair.person_key),'');
  if pair.profile_key='authorisedSignatoryCapacity' and expected='' then expected:=coalesce(btrim(person->>'role'),''); end if;
  if coalesce(btrim(p->>pair.profile_key),'')<>expected then
   return array_append(errors,'The selected signatory’s details changed. Reselect the person before saving.');
  end if;
 end loop;
 return errors;
end; $$;

-- Selecting a different captured person refreshes the affected authority pack,
-- even if duplicate names/contact values happen to match. Existing unlinked
-- signatory fingerprints retain their previous shape and accepted history.
alter function rental_private.landlord_definitions(jsonb) rename to landlord_definitions_before_selected_signatories;
create function rental_private.landlord_definitions(data jsonb)
returns table(subject_id text,scope_key text,purpose text,required boolean,fingerprint jsonb)
language plpgsql immutable set search_path='' as $$
declare row record; ref text:=coalesce(btrim(data#>>'{profile,primarySignatoryId}'),'');
begin
 for row in select * from rental_private.landlord_definitions_before_selected_signatories(data) loop
  subject_id:=row.subject_id; scope_key:=row.scope_key; purpose:=row.purpose; required:=row.required; fingerprint:=row.fingerprint;
  if ref<>'' and ((subject_id='signatory' and scope_key='identity') or purpose='signing_authority') then fingerprint:=fingerprint||jsonb_build_object('primarySignatoryId',ref); end if;
  return next;
 end loop;
end; $$;
revoke all on function rental_private.landlord_profile_errors(jsonb,text),rental_private.landlord_profile_errors_before_selected_signatories(jsonb,text),rental_private.landlord_definitions(jsonb),rental_private.landlord_definitions_before_selected_signatories(jsonb) from public,anon,authenticated,service_role;
commit;
