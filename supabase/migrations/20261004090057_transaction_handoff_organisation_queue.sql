begin;
create index handoff_organisation_required_idx on public.transaction_handoffs(owner_organisation_id,transaction_id) where required;
-- A corrupted handoff owner must not grant recovery authority to another tenant.
do $owner_guard$
declare definition text; guarded text;
begin
  definition:=pg_get_functiondef('public.bridge_recover_transaction_handoff(uuid,bigint,text,text,uuid)'::regprocedure);
  guarded:=replace(definition,'if h.id is null or not handoff_private.can_manage_recovery(h.owner_organisation_id) then',
    'if h.id is null or not handoff_private.can_manage_recovery(h.owner_organisation_id) or not exists(select 1 from public.transactions t where t.id=h.transaction_id and t.organisation_id=h.owner_organisation_id) then');
  if guarded=definition then raise exception 'Unexpected recovery owner guard'; end if;
  execute guarded;
  definition:=pg_get_functiondef('handoff_private.recovery_actions(uuid)'::regprocedure);
  guarded:=replace(definition,'or not h.required or h.instruction_status',
    'or not exists(select 1 from public.transactions t where t.id=h.transaction_id and t.organisation_id=h.owner_organisation_id) or not h.required or h.instruction_status');
  if guarded=definition then raise exception 'Unexpected recovery capability owner guard'; end if;
  execute guarded;
end $owner_guard$;
-- One read-only snapshot: pagination cannot turn missing evidence into success.
create function public.bridge_read_organisation_handoff_queue(p_organisation_id uuid,p_bucket text default 'all',p_limit integer default 25,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; page_size integer:=greatest(1,least(coalesce(p_limit,25),100)); page_offset integer:=greatest(0,coalesce(p_offset,0));
begin
  if not handoff_private.can_manage_recovery(p_organisation_id) then
    return jsonb_build_object('success',false,'code','organisation_authority_required'); end if;
  if p_bucket is null or p_bucket not in ('all','attention','invitation','receipt','delivery','waiting','data_gap') then
    return jsonb_build_object('success',false,'code','invalid_filter'); end if;
  with owned as materialized (
    select t.id,coalesce(nullif(to_jsonb(t)->>'transaction_reference',''),t.id::text) matter_label,
      coalesce(nullif(to_jsonb(t)->>'created_at','')::timestamptz,nullif(to_jsonb(t)->>'updated_at','')::timestamptz) created_at
    from public.transactions t where t.organisation_id=p_organisation_id
      and lower(coalesce(to_jsonb(t)->>'status','')) not in ('cancelled','canceled','terminated','archived','completed')
      and nullif(to_jsonb(t)->>'archived_at','') is null and coalesce(to_jsonb(t)->>'is_archived','false')<>'true'
  ), evidence as (
    select h.*,t.matter_label,
      exists(select 1 from public.transaction_handoff_dispatch_jobs j where j.handoff_id=h.id and j.generation=h.dispatch_generation and j.channel='workspace' and j.status<>'superseded') has_workspace_job,
      exists(select 1 from public.transaction_handoff_dispatch_jobs j where j.handoff_id=h.id and j.generation=h.dispatch_generation and j.channel='workspace' and j.status='sent') prepared_job,
      exists(select 1 from public.transaction_handoff_dispatch_jobs j where j.handoff_id=h.id and j.generation=h.dispatch_generation and j.channel='email' and j.status<>'superseded') has_email_job,
      exists(select 1 from public.transaction_handoff_dispatch_jobs j where j.handoff_id=h.id and j.generation=h.dispatch_generation and j.channel='email' and j.status='sent' and nullif(j.provider_id,'') is null) missing_receipt,
      exists(select 1 from public.transaction_handoff_dispatch_jobs j where j.handoff_id=h.id and j.generation=h.dispatch_generation and j.first_provider_attempt_at is not null
        and j.channel='email' and not exists(select 1 from handoff_private.email_payloads p where p.job_id=j.id)) missing_payload,
      case when h.role_type='bond_originator' then exists(select 1 from public.transaction_bond_applications a
          where a.transaction_id=h.transaction_id and a.application_type='originator_intake' and a.assigned_organisation_id=h.destination_organisation_id and a.assignment_status not in ('inactive','declined'))
        else exists(select 1 from public.transaction_attorney_assignments a join public.attorney_firms f on f.id=coalesce(a.attorney_firm_id,a.firm_id)
          where a.transaction_id=h.transaction_id and a.attorney_role=h.role_type and f.organisation_id=h.destination_organisation_id and coalesce(a.assignment_status,a.status,'')<>'removed') end has_native_matter,
      exists(select 1 from public.transaction_partner_assignments a where a.transaction_id=h.transaction_id and a.partner_role=h.role_type
        and a.partner_organisation_id=h.destination_organisation_id and a.assignment_status not in ('cancelled','declined')) has_partner_assignment,
      coalesce((select min(j.created_at) from public.transaction_handoff_dispatch_jobs j where j.handoff_id=h.id and j.generation=h.dispatch_generation and j.status not in ('sent','superseded')),
        (select i.created_at from public.transaction_partner_invitations i where i.id=h.invitation_id),h.workspace_prepared_at,h.created_at) pending_since
    from owned t join public.transaction_handoffs h on h.transaction_id=t.id where h.required
  ), classified as (
    select e.*,case
      when owner_organisation_id is distinct from p_organisation_id then 'handoff_owner_mismatch'
      when instruction_status='ready' and nomination_status='nominated' and not has_workspace_job then 'dispatch_job_missing'
      when prepared_job and (not has_native_matter or workspace_prepared_at is null) then 'native_matter_missing'
      when prepared_job and not has_partner_assignment then 'partner_assignment_missing'
      when prepared_job and not has_email_job then 'delivery_intent_missing'
      when missing_receipt then 'provider_receipt_missing'
      when missing_payload then 'frozen_payload_missing'
      else null end integrity_reason,
      case when invitation_status='pending' and invitation_expires_at<=now() then 'expired' else invitation_status end effective_invitation_status
    from evidence e
  ), queue as (
    select id::text queue_id,id handoff_id,transaction_id,matter_label,role_type,destination_company_name,invited_company_name,
      nomination_status,instruction_status,effective_invitation_status invitation_status,delivery_status,acceptance_status,dispatch_status,dispatch_reason,exception_keys,
      assignment_cleanup_status,pending_since,
      case when integrity_reason is not null then 'data_gap'
        when assignment_cleanup_status='review_required' or dispatch_status in ('blocked','failed') and instruction_status='ready' and effective_invitation_status<>'pending'
          or cardinality(exception_keys)>0 and effective_invitation_status<>'pending' and nomination_status<>'invited'
          or nomination_status='conflicting' or effective_invitation_status in ('expired','declined') or acceptance_status='declined' then 'attention'
        when effective_invitation_status='pending' or nomination_status='invited' then 'invitation'
        when dispatch_status='sent' and acceptance_status<>'accepted' then 'receipt'
        when dispatch_status='pending' then 'delivery'
        else 'waiting' end bucket,
      coalesce(integrity_reason,case when effective_invitation_status='expired' then 'invitation_expired' end,dispatch_reason,instruction_status) queue_reason
    from classified where integrity_reason is not null or dispatch_status<>'sent' or acceptance_status<>'accepted'
    union all
    select 'missing:'||t.id,null::uuid,t.id,t.matter_label,'register',null::text,null::text,null::text,null::text,null::text,null::text,null::text,null::text,null::text,'{}'::text[],null::text,t.created_at,'data_gap','register_missing'
    from owned t where not exists(select 1 from public.transaction_handoffs h where h.transaction_id=t.id and h.required)
  ), filtered as (
    select q.*,case bucket when 'data_gap' then 1 when 'attention' then 2 when 'invitation' then 3 when 'receipt' then 4 when 'delivery' then 5 else 6 end priority
    from queue q where p_bucket='all' or q.bucket=p_bucket
  ), page as (
    select * from filtered order by priority,pending_since nulls last,queue_id limit page_size offset page_offset
  )
  select jsonb_build_object('success',true,'organisationId',p_organisation_id,'asOf',now(),'total',(select count(*) from filtered),
    'counts',coalesce((select jsonb_object_agg(bucket,n) from(select bucket,count(*) n from queue group by bucket) counts),'{}'::jsonb),
    'hasMore',(select count(*) from filtered)>page_offset+page_size,'items',coalesce((select jsonb_agg(to_jsonb(page)-'priority' order by priority,pending_since nulls last,queue_id) from page),'[]'::jsonb)) into result;
  return result;
end $$;
revoke all on function public.bridge_read_organisation_handoff_queue(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.bridge_read_organisation_handoff_queue(uuid,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
