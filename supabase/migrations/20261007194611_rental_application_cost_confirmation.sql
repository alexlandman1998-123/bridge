-- Organisation-scoped fee settings; applications retain an immutable quote.
create table public.rental_application_fee_settings (
  organisation_id uuid primary key references public.organisations(id),
  amount numeric(12,2) not null default 0 check(amount >= 0),
  payment_instructions text not null default '' check(length(payment_instructions) <= 2000),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.rental_application_fee_settings enable row level security;
create policy rental_fee_read on public.rental_application_fee_settings for select to authenticated
using(public.rental_branch_access(organisation_id,null));
create policy rental_fee_write on public.rental_application_fee_settings for all to authenticated
using(public.bridge_current_workspace_role(organisation_id) in ('owner','principal','director','partner'))
with check(public.bridge_current_workspace_role(organisation_id) in ('owner','principal','director','partner'));
grant select,insert,update on public.rental_application_fee_settings to authenticated;
grant all on public.rental_application_fee_settings to service_role;

create function public.rental_save_application_fee_settings(p_organisation_id uuid,p_amount numeric,p_payment_instructions text,p_expected_version integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.rental_application_fee_settings%rowtype;
begin
 if auth.uid() is null or public.bridge_current_workspace_role(p_organisation_id) not in ('owner','principal','director','partner') or public.bridge_current_workspace_role(p_organisation_id) is null then raise exception 'Only organisation administrators can change rental fees'; end if;
 if p_amount is null or p_amount < 0 or p_amount > 9999999999.99 or p_amount <> round(p_amount,2) or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a non-negative fee with at most two decimal places'; end if;
 if length(coalesce(p_payment_instructions,'')) > 2000 or (p_amount > 0 and nullif(btrim(p_payment_instructions),'') is null) then raise exception 'Provide payment instructions for a payable fee'; end if;
 if p_expected_version=0 then
   insert into public.rental_application_fee_settings(organisation_id,amount,payment_instructions,updated_by) values(p_organisation_id,p_amount,btrim(coalesce(p_payment_instructions,'')),auth.uid()) on conflict do nothing returning * into saved;
 else
   update public.rental_application_fee_settings set amount=p_amount,payment_instructions=btrim(coalesce(p_payment_instructions,'')),version=version+1,updated_at=now(),updated_by=auth.uid() where organisation_id=p_organisation_id and version=p_expected_version returning * into saved;
 end if;
 if saved.organisation_id is null then raise exception 'Rental settings changed. Reload before saving'; end if;
 return to_jsonb(saved);
end; $$;
revoke all on function public.rental_save_application_fee_settings(uuid,numeric,text,integer) from public,anon;
grant execute on function public.rental_save_application_fee_settings(uuid,numeric,text,integer) to authenticated;

alter table public.rental_applications add column if not exists cost_snapshot_json jsonb not null default '{}'::jsonb,
 add column if not exists confirmation_json jsonb not null default '{}'::jsonb,
 add column if not exists application_fee_due_at timestamptz;
-- Existing applications are not retrospectively charged.
update public.rental_applications set cost_snapshot_json=jsonb_build_object('amount',0,'currency','ZAR','payableAfter','submission','settingsVersion',0,'paymentInstructions','','capturedAt',now()) where status in ('draft','submitted','under_review') and cost_snapshot_json='{}'::jsonb;

create function public.rental_application_cost_integrity()
returns trigger language plpgsql security definer set search_path='' as $$
declare fee public.rental_application_fee_settings%rowtype;
begin
 if tg_op='INSERT' then
   select * into fee from public.rental_application_fee_settings where organisation_id=new.organisation_id;
   new.cost_snapshot_json:=jsonb_build_object('amount',coalesce(fee.amount,0),'currency','ZAR','payableAfter','submission','settingsVersion',coalesce(fee.version,0),'paymentInstructions',coalesce(fee.payment_instructions,''),'capturedAt',now());
   new.confirmation_json:='{}'::jsonb; new.application_fee_due_at:=null;
 else
   if new.cost_snapshot_json is distinct from old.cost_snapshot_json or new.application_fee_due_at is distinct from old.application_fee_due_at then raise exception 'Application fee snapshot is protected'; end if;
   if new.confirmation_json is distinct from old.confirmation_json and (auth.uid() is not null or old.status <> 'draft') then raise exception 'Applicant confirmation requires the onboarding endpoint'; end if;
   if old.status='draft' and new.status='submitted' and new.cost_snapshot_json <> '{}'::jsonb then
     if new.confirmation_json->>'source' is distinct from 'applicant' or new.confirmation_json->>'wordingVersion' is distinct from 'rental-context-v1' or nullif(new.confirmation_json->>'privacyAcceptedAt','') is null or nullif(new.confirmation_json->>'acceptedAt','') is null or new.confirmation_json->'property' is distinct from coalesce(new.application_data->'property','{}'::jsonb) or new.confirmation_json->'costs' is distinct from new.cost_snapshot_json then raise exception 'Confirm the property, costs and privacy notice before submitting'; end if;
     if (new.cost_snapshot_json->>'amount')::numeric > 0 and old.application_fee_due_at is null then new.application_fee_due_at:=coalesce(new.submitted_at,now()); end if;
   end if;
 end if;
 return new;
end; $$;
revoke all on function public.rental_application_cost_integrity() from public,anon,authenticated;
create trigger rental_application_cost_integrity before insert or update on public.rental_applications for each row execute function public.rental_application_cost_integrity();
