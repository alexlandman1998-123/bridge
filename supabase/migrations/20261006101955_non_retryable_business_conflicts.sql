-- Reviewed business conflicts must return to the caller, not trigger automatic
-- PostgREST serialization retries. Only the 39 reviewed functions are changed.
-- Keep messages, detail codes, authorization, RLS, signatures and grants intact.
-- Body fingerprints refuse unrelated drift; already-corrected bodies are safe
-- to replay. Every replacement is in the same transaction.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $correction$
declare
  v_target record;
  v_oid oid;
  v_body text;
  v_definition text;
  v_count integer;
begin
  for v_target in
    select * from jsonb_to_recordset($targets$
[
  {
    "signature": "public.bridge_apply_safe_organisation_ownership_remediation(uuid,boolean)",
    "before_md5": "4ecb02d3821ab37b4c4e71b53bbf0cf5",
    "after_md5": "3f53d764fa69c9582875dfe4ad26a085",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_apply_safe_organisation_permission_integrity_repair(uuid,boolean)",
    "before_md5": "9dadde922508b41ff7726e7b4d0e6e53",
    "after_md5": "14d3837e0712991a55d7b1a580942cde",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_apply_signing_field_layout_e3(uuid,uuid,integer)",
    "before_md5": "6cf3d2f868bab46896e5ca65d3ef7e30",
    "after_md5": "108acd584e4cad5361c4264ec73f5403",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_apply_transaction_document_reconciliation_phase6(uuid,text)",
    "before_md5": "94f67d7c08ad1108ec0233dc89cd4d79",
    "after_md5": "93862d2cc711d26298ec0b8d8d9f10ba",
    "conflict_count": 3
  },
  {
    "signature": "public.bridge_freeze_editable_revision_for_render_c4(uuid,uuid,integer)",
    "before_md5": "112b540c14a5373c8acb5af29c34b043",
    "after_md5": "2baf90bb19bcb42c401604a082a09117",
    "conflict_count": 2
  },
  {
    "signature": "public.bridge_guard_document_packet_version_insert_i1()",
    "before_md5": "034213adec618c3ff3a9f7d19fff647b",
    "after_md5": "3d17c6ef5092ee6c674a8c0ed8d8f6eb",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_prepare_bond_wet_ink(integer,jsonb)",
    "before_md5": "748eb904bdc252fdbed00462c049da2f",
    "after_md5": "ed76e9007e16649b90cf9adf6be6ec11",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_reconcile_shared_matter_journey(uuid,text,uuid,text)",
    "before_md5": "11bb259bc20fab78162026e9211dcea1",
    "after_md5": "4de50980703861be30eb9b599a68d44c",
    "conflict_count": 2
  },
  {
    "signature": "public.bridge_record_bond_handoff_submission(uuid,uuid,text[],timestamp with time zone,text,text)",
    "before_md5": "d5cf73306a3b17d510566c9e72ee8317",
    "after_md5": "f59484459a19023eb012b91f975da478",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_record_bond_submission_review(uuid,uuid,text,jsonb)",
    "before_md5": "f9951597abdc909d4eb1681fd68c6d76",
    "after_md5": "030ec43f2c7a1d0d6657930ab0926642",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_respond_client_portal_appointment(text,uuid,uuid,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text)",
    "before_md5": "0e235324eadc96a18c7a5cfb2275d26c",
    "after_md5": "e39d0746495354da7139856c2ab0bf35",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_review_bond_handoff_document(uuid,uuid,text,text)",
    "before_md5": "246498e13a1864b25d8b3efc95755871",
    "after_md5": "f3bdc81e070284fa5fa9bc48abefb8dd",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_review_listing_seller_change(uuid,text,text,jsonb)",
    "before_md5": "2c7524a3c4d3ac0067643cffbf920393",
    "after_md5": "1d9fa22e84b0884cf3645b5220594fc2",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_review_private_listing_seller_document_p1_8(uuid,text,text,integer)",
    "before_md5": "93ce83e6cf80ff4e96fc09a8717a7c92",
    "after_md5": "139f84dd8a9fe9a6dd66dd4c682706ed",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_save_bond_application_portal_draft(jsonb,integer)",
    "before_md5": "a5751b0ae688783c8795b5fccaa4aa1d",
    "after_md5": "8c95426f9a21f28f4418e03982491124",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_save_buyer_bond_application_draft(jsonb,integer,jsonb,jsonb)",
    "before_md5": "1ee30763485f44e3998238bf201a3912",
    "after_md5": "606c947cd056af32cbb18a4076048e07",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_save_editable_document_revision_c2(uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,text)",
    "before_md5": "dc17a3b073787d271d26d7111fe3c2ef",
    "after_md5": "603500fd45120778a49644e3a5d6632e",
    "conflict_count": 2
  },
  {
    "signature": "public.bridge_save_signing_field_layout_e1(uuid,uuid,jsonb,integer)",
    "before_md5": "6252df43aeea89b03ebbb090e93bbdcb",
    "after_md5": "ff2d3e81783533a62ab7bb0c167a1ec4",
    "conflict_count": 2
  },
  {
    "signature": "public.bridge_save_transaction_detail_review(uuid,text,jsonb,jsonb,bigint,boolean,uuid)",
    "before_md5": "88265786a9f8742b16bf866db1a5ae39",
    "after_md5": "78831d6e206b2e8da5656c2f5303eb60",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_set_document_experience_rollout_n6(text,text,text,text,text,integer,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,uuid[],jsonb,integer)",
    "before_md5": "05836c040e892b0d0b67073c910e0e9d",
    "after_md5": "807ddb9fffab4f0a0ccbfbf11e56e602",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_submit_buyer_bond_application(integer,text)",
    "before_md5": "0d87a60131a0ec097583944b8a21082f",
    "after_md5": "6da0a2137b8d2b3017c54046a700a861",
    "conflict_count": 4
  },
  {
    "signature": "public.bridge_submit_listing_seller_change(uuid,text,text,jsonb,text[],bigint)",
    "before_md5": "9a4ff2c9594bfb858f3537655fb9f51c",
    "after_md5": "405d2cde7548198a304f91e71ce0df7e",
    "conflict_count": 1
  },
  {
    "signature": "public.bridge_update_attorney_workflow_step_v4(uuid,text,uuid,text,uuid,timestamp with time zone,text,text,jsonb)",
    "before_md5": "d0b217906723e70598ce91b5ca8af052",
    "after_md5": "a758d3ff4a3ef55d0c191504685889bd",
    "conflict_count": 1
  },
  {
    "signature": "public.recruitment_activate_agent(uuid,uuid,integer,text,boolean)",
    "before_md5": "5d728b69d0664075b6309b0625236b1a",
    "after_md5": "ba6f2b96628d49f0b00a7012b02c6d4d",
    "conflict_count": 2
  },
  {
    "signature": "public.recruitment_add_onboarding_document(uuid,uuid,integer,jsonb)",
    "before_md5": "948385eb5b5285aa587fe89fdeb16330",
    "after_md5": "7435c869e80b78a20853bc5b02c1591e",
    "conflict_count": 1
  },
  {
    "signature": "public.recruitment_approve_application(uuid,uuid,integer,text)",
    "before_md5": "497b3c6b8ced25a47c5c08a87970815c",
    "after_md5": "21a5c3913877df3425e87155fed93218",
    "conflict_count": 1
  },
  {
    "signature": "public.recruitment_prepare_contract(uuid,uuid,integer,jsonb)",
    "before_md5": "8f58f7b31e20282c4ba2b456e21418e1",
    "after_md5": "e8ffb25a76a02c3f2696698fbbd77386",
    "conflict_count": 1
  },
  {
    "signature": "public.recruitment_record_contract_delivery(uuid,uuid,integer,jsonb)",
    "before_md5": "2ffdbe767fc5df0d4c53ade9bf6c1a14",
    "after_md5": "d4a5b0437214bf3e69a7b927bc03f11c",
    "conflict_count": 1
  },
  {
    "signature": "public.recruitment_record_contract_signature(uuid,uuid,integer,jsonb)",
    "before_md5": "544e39787de99683a72106eae1e60203",
    "after_md5": "b1334d13d8e3aba8f86744202bc1f8ce",
    "conflict_count": 1
  },
  {
    "signature": "public.recruitment_save_onboarding(uuid,uuid,integer,jsonb,boolean)",
    "before_md5": "c5a43748de88c156e2e73b8a817c1a2e",
    "after_md5": "4251bb2057759c3d35b9d49a2de0fc9a",
    "conflict_count": 1
  },
  {
    "signature": "public.recruitment_start_review(uuid,uuid,integer)",
    "before_md5": "50298ba97a4561bb9686c91794b0a7e1",
    "after_md5": "495cba46d9b85eacfefc4c1c65f4c0d8",
    "conflict_count": 1
  },
  {
    "signature": "public.rental_convert_application_to_tenancy(uuid,integer)",
    "before_md5": "db7a98f75bcbfd8042a4ec1c2660578e",
    "after_md5": "225378d5d6cd6b8c36fa440f4d0a8c21",
    "conflict_count": 1
  },
  {
    "signature": "public.rental_decide_application(uuid,integer,text,text,jsonb)",
    "before_md5": "be0f84bcaf2b4b8db57059dc9b092386",
    "after_md5": "b826d4b8811445da95bd9e817f56d8a2",
    "conflict_count": 1
  },
  {
    "signature": "public.rental_prepare_lease_signing(uuid,integer,jsonb)",
    "before_md5": "46118fc83fad645a247352ca2d9baf8f",
    "after_md5": "ee7be706be4a38970459130e3ef6e3ce",
    "conflict_count": 1
  },
  {
    "signature": "public.rental_record_application_review(uuid,integer,text,jsonb)",
    "before_md5": "b5009d6d700ca3feb958d8d982a98d4e",
    "after_md5": "8576dc38898502412f000ccfbba530c3",
    "conflict_count": 1
  },
  {
    "signature": "public.rental_save_lease_draft(uuid,integer,jsonb)",
    "before_md5": "50f849ba0f66d4d3ffa538bcbb2e17f1",
    "after_md5": "e226e7f2d194d8c4fc60360648f5e4da",
    "conflict_count": 1
  },
  {
    "signature": "public.save_rental_listing_expiry_v1(uuid,timestamp with time zone,date)",
    "before_md5": "e4fd2cf41438065863ede907084c4381",
    "after_md5": "c773960c2d424f1d3f319112e44b6e2a",
    "conflict_count": 1
  },
  {
    "signature": "public.save_rental_listing_gallery_v2(uuid,timestamp with time zone,jsonb,integer)",
    "before_md5": "6a5b8f853c91a75e1191facad071149a",
    "after_md5": "10bc3d83c9b7a30d4ecc402051e07467",
    "conflict_count": 1
  },
  {
    "signature": "public.save_rental_listing_snapshot_v2(uuid,timestamp with time zone,jsonb,jsonb,jsonb,integer,jsonb)",
    "before_md5": "08d1438ccb90683ac11a224bf2e8e0d6",
    "after_md5": "46f9cd9019be4d476449420c2ea76d5c",
    "conflict_count": 1
  }
]
$targets$::jsonb) as targets(signature text, before_md5 text, after_md5 text, conflict_count integer)
  loop
    v_oid := pg_catalog.to_regprocedure(v_target.signature);
    if v_oid is null then
      raise exception 'Reviewed conflict function is missing: %', v_target.signature;
    end if;
    select prosrc into v_body from pg_catalog.pg_proc where oid = v_oid;
    if pg_catalog.md5(v_body) = v_target.after_md5 then
      continue;
    end if;
    if pg_catalog.md5(v_body) <> v_target.before_md5 then
      raise exception 'Reviewed conflict function changed since review: %', v_target.signature;
    end if;
    select count(*) into v_count from pg_catalog.regexp_matches(
      v_body, 'errcode[[:space:]]*=[[:space:]]*''40001''', 'gi'
    );
    if v_count <> v_target.conflict_count then
      raise exception 'Reviewed conflict branch count differs: %', v_target.signature;
    end if;
    v_definition := pg_catalog.regexp_replace(
      pg_catalog.pg_get_functiondef(v_oid),
      '(errcode[[:space:]]*=[[:space:]]*)''40001''', '\1''PT409''', 'gi'
    );
    execute v_definition;
    select prosrc into v_body from pg_catalog.pg_proc where oid = v_oid;
    if pg_catalog.md5(v_body) <> v_target.after_md5 then
      raise exception 'Reviewed conflict correction did not match: %', v_target.signature;
    end if;
  end loop;
end;
$correction$;

commit;
