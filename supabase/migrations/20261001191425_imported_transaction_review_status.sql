begin;

-- Classify legacy workbook imports and explicitly labelled future imports at
-- read time. No transaction, date, progress or confirmation is backfilled.
create function deal_review_private.import_evidence(p_transaction_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare t public.transactions%rowtype; provenance text[]; reference_row text[];
begin
  select * into t from public.transactions where id=p_transaction_id;
  if lower(btrim(coalesce(t.transaction_origin_source,''))) in ('import','bulk_import','bulk_upload','spreadsheet_import','otp_import') then return 'identified'; end if;
  provenance:=regexp_match(btrim(coalesce(t.comment,'')), '^Internal import draft from (.+\.xlsx) row ([0-9]+)\. Source PDF: (.+?\.pdf)\. Workbook status:', 'i');
  reference_row:=regexp_match(btrim(coalesce(t.transaction_reference,'')), '^PR-OTP-IMP-R([0-9]+)$', 'i');
  if provenance is not null and reference_row is not null and ltrim(provenance[2],'0')=ltrim(reference_row[1],'0') then return 'identified'; end if;
  return case when provenance is not null or reference_row is not null then 'candidate' else 'not_identified' end;
end;
$$;

-- Only a small aggregate leaves the private review store. Identity fields and
-- before/after history remain behind the phase-2 operator-authorisation gate.
create function public.bridge_get_imported_transaction_review_status(p_transaction_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.transactions%rowtype; evidence text; confirmed_count integer; source_available boolean; result jsonb:='[]';
begin
  if auth.uid() is null then raise exception 'Sign in to view transaction review status.' using errcode='42501'; end if;
  if p_transaction_ids is null or cardinality(p_transaction_ids)>200 then raise exception 'Supply at most 200 transaction IDs.' using errcode='22023'; end if;
  for t in select * from public.transactions where id=any(p_transaction_ids) order by id loop
    if not (public.bridge_can_access_transaction_spine(t.id) or public.bridge_can_access_transaction_org_member(t.id)) then continue; end if;
    evidence:=deal_review_private.import_evidence(t.id);
    if evidence='not_identified' then continue; end if;
    select count(*) into confirmed_count from deal_review_private.sections s where s.transaction_id=t.id
      and s.confirmed_at is not null and s.confirmed_snapshot=deal_review_private.snapshot(t.id,s.section)
      and s.source_signature=deal_review_private.document_signature(t.id,s.source_document_id);
    select exists(select 1 from public.documents d where d.transaction_id=t.id
      and deal_review_private.document_signature(t.id,d.id) is not null) into source_available;
    result:=result || jsonb_build_array(jsonb_build_object('transactionId',t.id,'evidence',evidence,
      'status',case when evidence='candidate' then 'import_candidate' when confirmed_count=4 then 'reviewed' when confirmed_count>0 then 'in_review' else 'needs_review' end,
      'confirmedCount',confirmed_count,'totalSections',4,'sourceAvailable',source_available));
  end loop;
  return result;
end;
$$;
revoke all on function deal_review_private.import_evidence(uuid) from public,anon,authenticated;
revoke all on function public.bridge_get_imported_transaction_review_status(uuid[]) from public,anon;
grant execute on function public.bridge_get_imported_transaction_review_status(uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;
